"""A generation addressed by an id survives the caller hanging up.

This is the box half of C2 (docs/C2_RESILIENT_GENERATION.md): forme used to run
the expensive half inside the customer's HTTP request, so a phone locking
mid-run threw away a run the image model had already been billed for. What is
covered here is the property that fixes it — *the same id never renders twice* —
plus the states forme polls for.
"""

from __future__ import annotations

import asyncio
import json
import os
import time

import pytest

from app.storage import generation_store
from app.storage.generation_store import DONE, ERROR, RUNNING, Failure, GenerationStore

ID = "11111111-2222-3333-4444-555555555555"
OTHER = "99999999-8888-7777-6666-555555555555"


@pytest.fixture
def store(tmp_path) -> GenerationStore:
    return GenerationStore(str(tmp_path / "gen"), ttl_minutes=60)


async def _exercise(store: GenerationStore, work) -> tuple:
    rec, started = store.start(ID, work)
    if rec.task is not None:
        await rec.task
    return rec, started


def test_the_same_id_is_only_ever_rendered_once(store: GenerationStore) -> None:
    runs = {"n": 0}

    async def work() -> dict:
        runs["n"] += 1
        return {"status": "approved", "run": runs["n"]}

    async def scenario() -> None:
        rec, started = await _exercise(store, work)
        assert started is True
        assert rec.state == DONE

        # The second ask is the whole point: a repeat POST after a dropped
        # connection must collect the answer, not buy another one.
        again, started_again = store.start(ID, work)
        assert started_again is False
        assert again.result == {"status": "approved", "run": 1}
        assert runs["n"] == 1

    asyncio.run(scenario())


def test_two_requests_racing_on_one_id_do_not_both_render(store: GenerationStore) -> None:
    """The check and the insert are under one lock — otherwise the id buys
    nothing under the exact concurrency it exists for."""
    runs = {"n": 0}
    gate = asyncio.Event()

    async def work() -> dict:
        runs["n"] += 1
        await gate.wait()
        return {"status": "approved"}

    async def scenario() -> None:
        first, started_first = store.start(ID, work)
        second, started_second = store.start(ID, work)
        assert started_first is True
        assert started_second is False
        assert first is second
        gate.set()
        await first.task
        assert runs["n"] == 1

    asyncio.run(scenario())


def test_a_running_generation_reports_running(store: GenerationStore) -> None:
    gate = asyncio.Event()

    async def work() -> dict:
        await gate.wait()
        return {"status": "approved"}

    async def scenario() -> None:
        rec, _ = store.start(ID, work)
        assert rec.state == RUNNING
        assert store.get(ID).public() == {"job_id": ID, "state": RUNNING}
        gate.set()
        await rec.task
        assert store.get(ID).state == DONE

    asyncio.run(scenario())


def test_a_shaped_failure_is_kept_the_way_the_caller_shaped_it(store: GenerationStore) -> None:
    """A run that failed for a legible reason must still report that reason
    after the connection that asked for it is gone."""

    async def work() -> dict:
        raise Failure(422, "QUOTA_EXHAUSTED", "the image budget ran out")

    async def scenario() -> None:
        rec, _ = await _exercise(store, work)
        assert rec.state == ERROR
        assert rec.error == {
            "status": 422,
            "error_code": "QUOTA_EXHAUSTED",
            "message": "the image budget ran out",
        }
        # `status` is transport, not payload: the caller reads it off the HTTP
        # response, and echoing it in the body invites two sources of truth.
        assert rec.public()["detail"] == {
            "error_code": "QUOTA_EXHAUSTED",
            "message": "the image budget ran out",
        }

    asyncio.run(scenario())


def test_an_unshaped_crash_still_lands_as_an_answer(store: GenerationStore) -> None:
    """A background task that dies silently would leave forme polling a run
    that will never finish — the failure mode this store replaces."""

    async def work() -> dict:
        raise RuntimeError("tracer segfaulted")

    async def scenario() -> None:
        rec, _ = await _exercise(store, work)
        assert rec.state == ERROR
        assert rec.error["error_code"] == "INTERNAL"
        assert "tracer segfaulted" in rec.error["message"]

    asyncio.run(scenario())


def test_a_finished_run_survives_the_process(tmp_path) -> None:
    """A deploy in the middle of a customer's run must not cost them the run."""

    async def work() -> dict:
        return {"status": "approved", "candidates": []}

    async def scenario() -> None:
        store = GenerationStore(str(tmp_path / "gen"), ttl_minutes=60)
        rec, _ = store.start(ID, work)
        await rec.task

    asyncio.run(scenario())

    restarted = GenerationStore(str(tmp_path / "gen"), ttl_minutes=60)
    rec = restarted.get(ID)
    assert rec is not None
    assert rec.state == DONE
    assert rec.result == {"status": "approved", "candidates": []}


def test_an_expired_run_is_gone_from_memory_and_disk(tmp_path) -> None:
    async def work() -> dict:
        return {"status": "approved"}

    async def scenario() -> None:
        store = GenerationStore(str(tmp_path / "gen"), ttl_minutes=60)
        rec, _ = store.start(ID, work)
        await rec.task
        rec.expires_at = time.time() - 1
        store._persist(rec)
        store.sweep()
        assert store.get(ID) is None
        assert not os.path.isdir(os.path.join(str(tmp_path / "gen"), ID))

    asyncio.run(scenario())


def test_an_unknown_id_is_unknown(store: GenerationStore) -> None:
    assert store.get(OTHER) is None


@pytest.mark.parametrize(
    "bad",
    ["", "..", "../../etc", "not-a-uuid", ID + "/x", "11111111-2222-3333-4444-55555555555"],
)
def test_only_a_uuid_may_name_a_generation(bad: str) -> None:
    """The id becomes a directory name. Refusing the malformed beats rewriting
    it: a sanitiser silently maps two different ids onto one run."""
    assert generation_store.valid_id(bad) is False


def test_a_corrupt_result_file_is_not_an_answer(tmp_path) -> None:
    store = GenerationStore(str(tmp_path / "gen"), ttl_minutes=60)
    directory = os.path.join(str(tmp_path / "gen"), ID)
    os.makedirs(directory)
    with open(os.path.join(directory, "generation.json"), "w") as f:
        f.write("{ truncated")
    assert store.get(ID) is None


def test_the_result_file_is_written_whole_or_not_at_all(tmp_path) -> None:
    """Written to a temp name and renamed: a reader that arrives mid-write must
    not see half a result and treat it as the run."""

    async def work() -> dict:
        return {"status": "approved"}

    async def scenario() -> None:
        store = GenerationStore(str(tmp_path / "gen"), ttl_minutes=60)
        rec, _ = store.start(ID, work)
        await rec.task

    asyncio.run(scenario())

    directory = os.path.join(str(tmp_path / "gen"), ID)
    assert os.listdir(directory) == ["generation.json"]
    with open(os.path.join(directory, "generation.json")) as f:
        assert json.load(f)["result"] == {"status": "approved"}
