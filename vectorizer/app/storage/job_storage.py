"""In-memory job registry backed by isolated temp directories (no DB, per spec).

A job owns a directory of fixed-name output files. Records carry a TTL; expired
jobs are purged lazily on access and on startup. Only whitelisted filenames are
ever served — no user-supplied paths, no traversal.
"""

from __future__ import annotations

import os
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from ..config import SETTINGS

ALLOWED_FILES = frozenset(
    {"metal.svg", "cutouts.svg", "rendered.png", "difference.png", "overlay.png", "result.json"}
)


@dataclass
class JobRecord:
    job_id: str
    status: str
    created_at: float
    expires_at: float
    directory: str
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    result: dict = field(default_factory=dict)


class JobStore:
    def __init__(self, base_dir: str, ttl_minutes: int) -> None:
        self._base = base_dir
        self._ttl = ttl_minutes * 60
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()
        os.makedirs(self._base, exist_ok=True)
        self._purge_orphans()

    def _purge_orphans(self) -> None:
        # remove any directories left over from a previous process
        for name in os.listdir(self._base):
            path = os.path.join(self._base, name)
            if os.path.isdir(path) and name not in self._jobs:
                shutil.rmtree(path, ignore_errors=True)

    def create(self) -> JobRecord:
        # Sweep here and not only in get(). forme only ever POSTs — it never
        # reads a job back or deletes one — so with the sweep on the read path
        # alone nothing was ever collected: every /api/jobs left a directory of
        # megabyte PNGs and a record in memory, and both grew until a restart.
        self.sweep()
        now = time.time()
        job_id = str(uuid.uuid4())
        directory = os.path.join(self._base, job_id)
        os.makedirs(directory, exist_ok=True)
        rec = JobRecord(
            job_id=job_id,
            status="created",
            created_at=now,
            expires_at=now + self._ttl,
            directory=directory,
        )
        with self._lock:
            self._jobs[job_id] = rec
        return rec

    def get(self, job_id: str) -> Optional[JobRecord]:
        self.sweep()
        with self._lock:
            return self._jobs.get(job_id)

    def write_file(self, rec: JobRecord, name: str, data: bytes) -> None:
        if name not in ALLOWED_FILES:
            raise ValueError(f"disallowed output filename: {name}")
        with open(os.path.join(rec.directory, name), "wb") as f:
            f.write(data)

    def file_path(self, rec: JobRecord, name: str) -> Optional[str]:
        if name not in ALLOWED_FILES:
            return None
        path = os.path.join(rec.directory, name)
        return path if os.path.isfile(path) else None

    def delete(self, job_id: str) -> bool:
        with self._lock:
            rec = self._jobs.pop(job_id, None)
        if rec is None:
            return False
        shutil.rmtree(rec.directory, ignore_errors=True)
        return True

    def sweep(self) -> None:
        now = time.time()
        expired = []
        with self._lock:
            for jid, rec in list(self._jobs.items()):
                if rec.expires_at <= now:
                    expired.append(rec)
                    del self._jobs[jid]
        for rec in expired:
            shutil.rmtree(rec.directory, ignore_errors=True)


STORE = JobStore(SETTINGS.job_storage_dir, SETTINGS.job_ttl_minutes)
