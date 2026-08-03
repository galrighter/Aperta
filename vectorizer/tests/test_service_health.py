"""Three ways the box used to fall over quietly, and what stops each now.

None of these changed a single output — which is exactly why they need tests.
A blocked event loop, an uncollected temp directory and an unbounded fan-out all
look like a healthy service right up until the box stops answering.
"""

from __future__ import annotations

import inspect
import time

from app import generate
from app.api import main
from app.storage.job_storage import JobStore

# The fake model/tracer/network rig lives with the tests it was written for.
# pytest puts tests/ on the path (there is a conftest and no package), so this
# borrows the fixture rather than growing a second copy that drifts.
from test_generate import wired  # noqa: F401


def test_the_pipeline_does_not_run_on_the_event_loop() -> None:
    """uvicorn runs one worker, and the pipeline is tens of seconds of CPU.

    Called inline it froze /api/health and every /api/generate in flight with
    it, so the health poll (or nginx) answered 502 while the box was merely
    busy — a dead-service signal for a service that was working.
    """
    src = inspect.getsource(main.create_job)
    assert "anyio.to_thread.run_sync" in src
    assert "pipeline.run_pipeline(" not in src  # i.e. never called directly


def test_a_job_directory_is_collected_without_anyone_reading_it(tmp_path) -> None:
    """forme only ever POSTs. It never reads a job back and never deletes one.

    With the sweep on the read path alone, nothing was ever collected: every
    /api/jobs left a directory of megabyte PNGs and an in-memory record, and
    both grew until a restart.
    """
    store = JobStore(str(tmp_path / "jobs"), ttl_minutes=60)
    first = store.create()
    store.write_file(first, "result.json", b"{}")
    first.expires_at = time.time() - 1

    # A second POST, and only a POST.
    store.create()

    assert store.get(first.job_id) is None
    assert not (tmp_path / "jobs" / first.job_id).exists()


def test_the_panel_fan_out_is_bounded(monkeypatch, wired) -> None:
    """split_panels returns a panel per band it *detected*, not per row asked
    for. A noisy render yields dozens, each one a 15-candidate pipeline, and the
    run then blows past forme's 240s and nginx's 300s while the box keeps
    computing for an hour on an answer nobody is waiting for."""
    monkeypatch.setattr(generate, "split_panels", lambda data, cols: [b"panel"] * 40)

    out = _run(generate.GenerateJob(prompt="p", calls=1, rows=1, cols=1))

    cap = generate.PANELS_PER_RENDER_CAP
    assert out["panels"] == cap
    # And it says so, rather than trimming in silence — the count is the whole
    # signal that the render came back as noise.
    assert any("40 panels" in note for note in out["debug"]["warnings"])


def test_a_grid_that_asks_for_more_gets_more(monkeypatch, wired) -> None:
    """The cap scales with the grid; it is not a flat ceiling on alternatives."""
    monkeypatch.setattr(generate, "split_panels", lambda data, cols: [b"panel"] * 40)

    out = _run(generate.GenerateJob(prompt="p", calls=1, rows=4, cols=2))

    assert out["panels"] == generate.PANELS_PER_RENDER_CAP * 4 * 2


def _run(job: generate.GenerateJob) -> dict:
    import asyncio

    return asyncio.run(generate.run(job, generate.Artifacts(), "key", 2))
