"""Orchestration tests for /api/generate.

The tracer itself is covered by test_pipeline; what is worth pinning down here is
the wiring around it — how many renders are asked for, that every row becomes a
candidate, which panel is reported as the run, that a dead panel does not kill
the generation, and that artefacts only ever go to the URLs forme handed over.
"""

from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass

import numpy as np
import pytest
from PIL import Image

from app import generate


def striped_png(rows: int) -> bytes:
    width, height = 300, 200
    rgba = np.full((height, width, 4), 255, dtype=np.uint8)
    slot = height // rows
    bar = int(slot * 0.5)
    for r in range(rows):
        y0 = r * slot + (slot - bar) // 2
        rgba[y0 : y0 + bar, 20 : width - 20, :3] = 17
    buf = io.BytesIO()
    Image.fromarray(rgba).save(buf, format="PNG")
    return buf.getvalue()


# --- stand-ins for the tracer, shaped like the real PipelineResult ------------


@dataclass
class FakeMetrics:
    def to_dict(self) -> dict:
        return {"iou": 0.93}


@dataclass
class FakeSelected:
    cutouts_svg: str
    metrics: FakeMetrics


@dataclass
class FakeSelection:
    selected: FakeSelected | None


@dataclass
class FakeResult:
    status: str
    selection: FakeSelection
    width_mm: float = 10.0


def fake_trace(status: str = "approved", svg: str = "<svg/>"):
    def _trace(panel: bytes, height_mm: float, color_key: str, min_hole_mm: float) -> FakeResult:
        return FakeResult(status, FakeSelection(FakeSelected(svg, FakeMetrics())))

    return _trace


@pytest.fixture
def wired(monkeypatch):
    """Patch out the model, the tracer and the network; keep the real splitter."""
    state: dict = {"calls": 0, "uploads": []}

    async def render_many(key, prompt, calls, reference=None):
        state["calls"] = calls
        state["prompt"] = prompt
        state["reference"] = reference
        return [striped_png(state.get("rows", 1)) for _ in range(calls)]

    async def put_all(items, content_type="image/png"):
        state["uploads"] = [url for url, _ in items]
        state["upload_bytes"] = [len(data) for _, data in items]
        return [url for url, _ in items]

    monkeypatch.setattr(generate.imagegen, "render_many", render_many)
    monkeypatch.setattr(generate.uploads, "put_all", put_all)
    monkeypatch.setattr(generate, "_stage_images", lambda res: {"overlay": b"png", "rendered": b"png"})
    monkeypatch.setattr(generate, "_trace", fake_trace())
    # The serialisers read the real PipelineResult; the fakes only carry what the
    # orchestration itself touches.
    monkeypatch.setattr(generate.pipeline, "build_debug", lambda res: {"images": {}, "stages": []})
    monkeypatch.setattr(generate.pipeline, "to_result_dict", lambda res: {"status": res.status})
    return state


def run(job, artifacts=None, concurrency=2):
    return asyncio.run(generate.run(job, artifacts or generate.Artifacts(), "key", concurrency))


def test_one_candidate_per_render_when_the_model_draws_one_row(wired):
    out = run(generate.GenerateJob(prompt="p", calls=4, rows=1))
    assert wired["calls"] == 4
    assert out["renders"] == 4
    assert out["panels"] == 4
    assert len(out["candidates"]) == 4


def test_every_row_of_a_render_becomes_a_candidate(wired):
    wired["rows"] = 3
    out = run(generate.GenerateJob(prompt="p", calls=2, rows=3))
    assert out["panels"] == 6
    assert len(out["candidates"]) == 6
    assert all(c["cutouts_svg"] == "<svg/>" for c in out["candidates"])


def test_a_panel_the_tracer_chokes_on_does_not_fail_the_run(wired, monkeypatch):
    def flaky(panel: bytes, height_mm: float, color_key: str, min_hole_mm: float):
        if flaky.n == 0:
            flaky.n += 1
            raise ValueError("no foreground found")
        return FakeResult("approved", FakeSelection(FakeSelected("<svg/>", FakeMetrics())))

    flaky.n = 0
    monkeypatch.setattr(generate, "_trace", flaky)
    out = run(generate.GenerateJob(prompt="p", calls=3, rows=1))
    assert out["panels"] == 3
    assert len(out["candidates"]) == 2  # the dead panel is dropped, not fatal


def test_the_logged_run_is_the_first_approved_panel(wired, monkeypatch):
    def mixed(panel: bytes, height_mm: float, color_key: str, min_hole_mm: float):
        mixed.n += 1
        approved = mixed.n == 2
        return FakeResult(
            "approved" if approved else "rejected",
            FakeSelection(FakeSelected("<svg/>", FakeMetrics()) if approved else None),
        )

    mixed.n = 0
    monkeypatch.setattr(generate, "_trace", mixed)
    # one at a time, so "the second panel" means something to assert on
    out = run(generate.GenerateJob(prompt="p", calls=3, rows=1), concurrency=1)
    assert out["selected_panel"] == 1
    assert out["candidates"][1]["status"] == "approved"


def test_nothing_is_uploaded_without_a_signed_url(wired):
    out = run(generate.GenerateJob(prompt="p", calls=2, rows=1))
    assert wired["uploads"] == []
    assert out["uploaded_renders"] == []
    assert out["uploaded_stages"] == []


def test_artefacts_go_only_to_the_urls_forme_handed_over(wired):
    artifacts = generate.Artifacts(
        renders=["https://x/render-0", "https://x/render-1"],
        stages={"overlay": "https://x/overlay", "difference": "https://x/difference"},
    )
    out = run(generate.GenerateJob(prompt="p", calls=2, rows=1), artifacts)
    # two renders + the one stage image that exists ("difference" is absent here)
    assert wired["uploads"] == ["https://x/render-0", "https://x/render-1", "https://x/overlay"]
    assert out["uploaded_renders"] == [0, 1]
    assert out["uploaded_stages"] == ["overlay"]


def test_more_renders_than_urls_uploads_only_what_was_signed(wired):
    artifacts = generate.Artifacts(renders=["https://x/render-0"])
    out = run(generate.GenerateJob(prompt="p", calls=3, rows=1), artifacts)
    assert wired["uploads"] == ["https://x/render-0"]
    assert out["uploaded_renders"] == [0]


# --- the edit reference ------------------------------------------------------


BASE_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">'
    '<rect width="120" height="80" fill="#ffffff"/>'
    '<rect x="10" y="30" width="100" height="20" fill="#111111"/>'
    "</svg>"
)


def test_a_base_svg_is_rasterised_and_handed_to_the_model(wired, monkeypatch):
    """The edit path: what reaches the image model is the current piece, drawn."""
    drawn: dict = {}

    def fake_render(svg, width, height):
        drawn["svg"], drawn["size"] = svg, (width, height)
        return b"\x89PNG-current-piece"

    monkeypatch.setattr(generate.renderer, "render_svg_to_png", fake_render)
    run(generate.GenerateJob(prompt="p", calls=2, rows=1, base_svg=BASE_SVG))

    assert wired["reference"] == (b"\x89PNG-current-piece", "image/png")
    assert drawn["svg"] == BASE_SVG
    # the canvas the model is asked to draw on, so the reference is not letterboxed
    assert drawn["size"] == tuple(int(n) for n in generate.imagegen.SIZE.split("x"))


def test_the_base_svg_wins_over_an_inspiration_image(wired, monkeypatch):
    monkeypatch.setattr(generate.renderer, "render_svg_to_png", lambda *a: b"current")
    run(
        generate.GenerateJob(
            prompt="p", calls=1, rows=1, base_svg=BASE_SVG, inspiration=(b"moodboard", "image/png")
        )
    )
    assert wired["reference"] == (b"current", "image/png")


def test_without_a_base_svg_the_inspiration_is_still_the_reference(wired):
    run(generate.GenerateJob(prompt="p", calls=1, rows=1, inspiration=(b"moodboard", "image/png")))
    assert wired["reference"] == (b"moodboard", "image/png")


def test_a_base_svg_that_cannot_be_drawn_fails_the_run(wired, monkeypatch):
    """Never a quiet fall-through to text-only — that is a brand new piece."""

    def boom(*a):
        raise generate.renderer.RenderError("resvg failed")

    monkeypatch.setattr(generate.renderer, "render_svg_to_png", boom)
    with pytest.raises(generate.imagegen.ImageGenError):
        run(generate.GenerateJob(prompt="p", calls=1, rows=1, base_svg=BASE_SVG))


def test_endpoint_passes_the_base_svg_through(wired, monkeypatch):
    from fastapi.testclient import TestClient

    from app.api import main

    monkeypatch.setattr(generate.renderer, "render_svg_to_png", lambda *a: b"current")
    client = TestClient(main.app)
    resp = client.post(
        "/api/generate",
        json={"prompt": "less cuts", "calls": 1, "rows": 1, "height_mm": 15, "base_svg": BASE_SVG},
    )
    assert resp.status_code == 200
    assert wired["reference"] == (b"current", "image/png")


# --- the HTTP contract forme codes against ----------------------------------


def test_endpoint_returns_the_candidates(wired):
    from fastapi.testclient import TestClient

    from app.api import main

    client = TestClient(main.app)
    resp = client.post(
        "/api/generate",
        json={"prompt": "a ring", "calls": 2, "rows": 1, "height_mm": 10, "color_key": "dark"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["model"] == generate.imagegen.MODEL
    assert len(body["candidates"]) == 2
    assert body["candidates"][0]["cutouts_svg"] == "<svg/>"
    assert body["selected_panel"] == 0


def test_endpoint_rejects_an_unknown_colour_key(wired):
    from fastapi.testclient import TestClient

    from app.api import main

    client = TestClient(main.app)
    resp = client.post("/api/generate", json={"prompt": "p", "color_key": "chartreuse"})
    assert resp.status_code == 400


def test_endpoint_surfaces_an_image_model_failure_as_retriable(wired, monkeypatch):
    from fastapi.testclient import TestClient

    from app.api import main

    async def boom(*a, **k):
        raise generate.imagegen.ImageGenError("gpt-image-1-mini: 429 rate limited")

    monkeypatch.setattr(generate.imagegen, "render_many", boom)
    client = TestClient(main.app)
    resp = client.post("/api/generate", json={"prompt": "p"})
    # 422 and not 502: Cloudflare replaces the body of a 502 with its own error
    # page, so on the old status forme received "error code: 502" and logged that
    # instead of the reason. The status has to be one the edge passes through.
    assert resp.status_code == 422
    assert resp.json()["detail"]["error_code"] == "RENDER_FAILED"
    assert "429" in resp.json()["detail"]["message"]


def test_endpoint_names_a_spent_budget_as_its_own_failure(wired, monkeypatch):
    """A spent OpenAI budget is the one failure nobody can fix from the app.

    It has to arrive at forme as its own code — that is what triggers the alert
    mail. Folded into RENDER_FAILED it reads like any other flaky render, and the
    site stays down until somebody happens to look.
    """
    from fastapi.testclient import TestClient

    from app.api import main

    async def broke(*a, **k):
        raise generate.imagegen.ImageGenError(
            'gpt-image-1-mini: 429 {"error":{"code":"insufficient_quota"}}', quota=True
        )

    monkeypatch.setattr(generate.imagegen, "render_many", broke)
    client = TestClient(main.app)
    resp = client.post("/api/generate", json={"prompt": "p"})
    assert resp.status_code == 422
    assert resp.json()["detail"]["error_code"] == "QUOTA_EXHAUSTED"
    # The provider's own words survive: they are the proof, and they are what
    # tells a spent budget apart from a failure phrased like one.
    assert "insufficient_quota" in resp.json()["detail"]["message"]


def test_quota_is_read_off_the_provider_body(monkeypatch):
    from app import imagegen

    assert imagegen._is_quota('{"error":{"code":"insufficient_quota"}}')
    assert imagegen._is_quota("You exceeded your current quota")
    assert imagegen._is_quota("billing_hard_limit_reached")
    # A plain rate limit is not a spent budget: it passes on its own, and an
    # alert on every busy minute is an alert nobody reads.
    assert not imagegen._is_quota('{"error":{"code":"rate_limit_exceeded"}}')


def test_a_spent_budget_survives_the_aggregation(monkeypatch):
    """Four calls fail together; one of them says the budget is gone."""
    import asyncio

    from app import imagegen

    async def scenario():
        async def one(client, key, prompt, reference):
            raise imagegen.ImageGenError('429 {"code":"insufficient_quota"}', quota=True)

        monkeypatch.setattr(imagegen, "_one", one)
        with pytest.raises(imagegen.ImageGenError) as caught:
            await imagegen.render_many("k", "prompt", 4)
        assert caught.value.quota is True
        # Nothing to retry: the next call costs the same and fails the same.
        assert caught.value.retriable is False

    asyncio.run(scenario())
