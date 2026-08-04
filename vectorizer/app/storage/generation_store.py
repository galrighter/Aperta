"""Generations held on the box, so a dropped connection does not lose a paid run.

forme used to run the heavy half inside the customer's HTTP request: a phone
locking mid-run killed the Worker invocation *after* the image model had been
billed, and the version was never saved. The fix is that whoever does the
expensive work also remembers the answer — see docs/C2_RESILIENT_GENERATION.md.

So a generation is addressed by an id **forme derives** (deterministically, from
its own job id) and hands us. A repeat POST with that id never starts a second
run: it joins the one in flight, or gets the finished result back.

Finished results are also written to disk, so a deploy or a container restart
does not throw away a run that already cost money. A run still *in flight* when
the process dies is lost — there is nothing to persist yet, and forme starting
over is the correct outcome.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import threading
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional

from ..config import SETTINGS

log = logging.getLogger(__name__)

RUNNING = "running"
DONE = "done"
ERROR = "error"

#: forme sends a UUID it derived from its job id. Anything else is refused
#: rather than sanitised — the id becomes a directory name, and a rule that
#: rewrites its input is a rule you cannot reason about at the call site.
ID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

_RESULT_FILE = "generation.json"


def valid_id(job_id: str) -> bool:
    return bool(ID_RE.match(job_id))


class Busy(Exception):
    """The box is already running as many generations as it will hold.

    Its own exception rather than a `Failure`: a `Failure` is a run that
    happened and went wrong, and this is a run that never started — nothing was
    billed, and asking again later is the right move.
    """


class Failure(Exception):
    """A failure the work callable already shaped for forme.

    The detail is the same shape the synchronous path raises through
    `HTTPException`, so a run that failed in the background reports its reason
    exactly as it would have reported it inline.
    """

    def __init__(self, status: int, error_code: str, message: str) -> None:
        super().__init__(message)
        self.detail = {"status": status, "error_code": error_code, "message": message}


@dataclass
class GenerationRecord:
    job_id: str
    state: str
    created_at: float
    expires_at: float
    result: Optional[dict] = None
    #: What forme should surface, shaped like the HTTPException detail the
    #: synchronous path raises: {"status": int, "error_code": str, "message": str}.
    error: Optional[dict] = None
    #: Held only to keep the background task from being garbage-collected
    #: mid-run; never serialised.
    task: Optional[asyncio.Task] = field(default=None, repr=False)

    def public(self) -> dict:
        out: dict = {"job_id": self.job_id, "state": self.state}
        if self.result is not None:
            out["result"] = self.result
        if self.error is not None:
            out["detail"] = {k: v for k, v in self.error.items() if k != "status"}
        return out


class GenerationStore:
    def __init__(self, base_dir: str, ttl_minutes: int, max_running: int = 0) -> None:
        self._base = base_dir
        self._ttl = ttl_minutes * 60
        #: 0 = unbounded, which is what a test that is not about the cap wants.
        self._limit = max_running
        self._runs: dict[str, GenerationRecord] = {}
        self._lock = threading.Lock()
        os.makedirs(self._base, exist_ok=True)

    # --- lookup -----------------------------------------------------------

    def get(self, job_id: str) -> Optional[GenerationRecord]:
        """The run, from memory or — for a finished one — from disk."""
        self.sweep()
        with self._lock:
            rec = self._runs.get(job_id)
        if rec is not None:
            return rec
        return self._load(job_id)

    def _load(self, job_id: str) -> Optional[GenerationRecord]:
        if not valid_id(job_id):
            return None
        path = os.path.join(self._base, job_id, _RESULT_FILE)
        try:
            with open(path, "rb") as f:
                saved = json.loads(f.read())
        except (OSError, ValueError):
            return None
        rec = GenerationRecord(
            job_id=job_id,
            state=saved.get("state", DONE),
            created_at=saved.get("created_at", time.time()),
            expires_at=saved.get("expires_at", time.time() + self._ttl),
            result=saved.get("result"),
            error=saved.get("error"),
        )
        if rec.expires_at <= time.time():
            shutil.rmtree(os.path.join(self._base, job_id), ignore_errors=True)
            return None
        with self._lock:
            self._runs.setdefault(job_id, rec)
        return rec

    # --- starting ---------------------------------------------------------

    def start(
        self, job_id: str, work: Callable[[], Awaitable[dict]]
    ) -> tuple[GenerationRecord, bool]:
        """Return the run for `job_id`, starting it if this is the first ask.

        The second element says whether *this* call started it. The check and
        the insert are under one lock: two requests racing on the same id must
        not both reach the image model, which is the whole point of the id.
        """
        existing = self.get(job_id)
        if existing is not None:
            return existing, False

        now = time.time()
        with self._lock:
            racer = self._runs.get(job_id)
            if racer is not None:
                return racer, False
            # Counted under the same lock as the insert, for the same reason the
            # id is: two requests arriving together must not both find room.
            # Only a *new* id is refused — a repeat POST is already counted, and
            # turning it away would strand a run that is genuinely in flight.
            if self._limit and sum(1 for r in self._runs.values() if r.state == RUNNING) >= self._limit:
                raise Busy(f"{self._limit} generations already running")
            rec = GenerationRecord(
                job_id=job_id, state=RUNNING, created_at=now, expires_at=now + self._ttl
            )
            self._runs[job_id] = rec

        rec.task = asyncio.ensure_future(self._run(rec, work))
        return rec, True

    async def _run(self, rec: GenerationRecord, work: Callable[[], Awaitable[dict]]) -> None:
        try:
            result = await work()
        except Failure as exc:
            self.fail(rec, exc.detail)
        except asyncio.CancelledError:
            # The process is going down. Leave nothing on disk claiming an
            # answer we do not have; forme re-running is the right outcome.
            self.fail(rec, {"status": 500, "error_code": "CANCELLED", "message": "the service stopped mid-run"})
            raise
        except Exception as exc:  # noqa: BLE001 - the boundary of a background task
            log.exception("generation %s failed", rec.job_id)
            self.fail(rec, {"status": 500, "error_code": "INTERNAL", "message": str(exc)})
        else:
            self.finish(rec, result)

    # --- completion -------------------------------------------------------

    def finish(self, rec: GenerationRecord, result: dict) -> None:
        rec.state = DONE
        rec.result = result
        rec.task = None
        self._persist(rec)

    def fail(self, rec: GenerationRecord, detail: dict) -> None:
        rec.state = ERROR
        rec.error = detail
        rec.task = None
        self._persist(rec)

    def _persist(self, rec: GenerationRecord) -> None:
        """Write the outcome to disk. Best-effort: the in-memory copy already
        answers, and losing the disk copy only costs us a restart's worth of
        memory — not the run."""
        try:
            directory = os.path.join(self._base, rec.job_id)
            os.makedirs(directory, exist_ok=True)
            payload = {
                "state": rec.state,
                "created_at": rec.created_at,
                "expires_at": rec.expires_at,
                "result": rec.result,
                "error": rec.error,
            }
            tmp = os.path.join(directory, _RESULT_FILE + ".tmp")
            with open(tmp, "wb") as f:
                f.write(json.dumps(payload).encode())
            os.replace(tmp, os.path.join(directory, _RESULT_FILE))
        except OSError as exc:
            log.warning("could not persist generation %s: %s", rec.job_id, exc)

    # --- lifecycle --------------------------------------------------------

    def sweep(self) -> None:
        now = time.time()
        with self._lock:
            expired = [jid for jid, rec in self._runs.items() if rec.expires_at <= now]
            for jid in expired:
                del self._runs[jid]
        for jid in expired:
            shutil.rmtree(os.path.join(self._base, jid), ignore_errors=True)


GENERATIONS = GenerationStore(
    SETTINGS.generation_storage_dir, SETTINGS.job_ttl_minutes, SETTINGS.max_concurrent_generations
)
