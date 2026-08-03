"""Smoke + contract tests for the vectorizer pipeline and HTTP layer."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from app import pipeline
from app.core.validation import InputError
from scripts.make_fixture import make


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def fixture_png() -> bytes:
    return _png_bytes(make(3200, 300))


def test_pipeline_approves_faithful_trace(fixture_png: bytes) -> None:
    res = pipeline.run_pipeline(fixture_png, 160, 15)
    assert res.status == "approved"
    sel = res.selection.selected
    assert sel is not None
    m = sel.metrics
    assert m.iou >= 0.99
    assert m.topology_ok
    # mean deviation is the real fidelity guarantee; max rises at rounded
    # corners once Chaikin smoothing (SMOOTH_ITERS) is on by default.
    assert m.mean_contour_deviation_mm <= 0.05
    assert m.source_topology.holes == m.vector_topology.holes


def test_output_svgs_are_closed_and_have_viewbox(fixture_png: bytes) -> None:
    res = pipeline.run_pipeline(fixture_png, 160, 15)
    sel = res.selection.selected
    assert sel is not None
    assert 'viewBox="0 0 160 15"' in sel.metal_svg
    assert 'id="cutouts"' in sel.cutouts_svg
    # every subpath closed
    assert sel.metal_svg.count("M") == sel.metal_svg.count("Z")
    assert sel.geometry_stats.open_paths == 0
    assert sel.geometry_stats.self_intersections == 0


def test_aspect_ratio_mismatch_rejected(fixture_png: bytes) -> None:
    with pytest.raises(InputError) as exc:
        pipeline.run_pipeline(fixture_png, 160, 40)  # wrong physical ratio
    assert exc.value.code == "ASPECT_RATIO_MISMATCH"


def test_blank_image_rejected() -> None:
    blank = Image.new("RGBA", (3200, 300), (255, 255, 255, 255))  # ratio-correct, all white
    with pytest.raises(InputError) as exc:
        pipeline.run_pipeline(_png_bytes(blank), 160, 15)
    assert exc.value.code in ("NO_FOREGROUND_FOUND", "FULL_FOREGROUND_IMAGE")


def test_border_snap_recovers_edge_column(fixture_png: bytes) -> None:
    """Regression: metal touching the stock edge must render to the edge."""
    res = pipeline.run_pipeline(fixture_png, 160, 15)
    ren = res.rendered_mask
    assert ren is not None
    # the far column should carry metal (border snap fixed the missing sliver)
    assert int((ren[:, -1] > 0).sum()) > 0


def test_http_roundtrip(fixture_png: bytes, client) -> None:
    assert client.get("/api/health").json()["status"] == "ok"

    resp = client.post(
        "/api/jobs",
        files={"image": ("f.png", fixture_png, "image/png")},
        data={"width_mm": "160", "height_mm": "15"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "approved"
    assert "cutouts_svg" in body
    job_id = body["job_id"]

    f = client.get(f"/api/jobs/{job_id}/files/cutouts.svg")
    assert f.status_code == 200
    assert b"cutouts" in f.content

    # path traversal / disallowed names are rejected
    assert client.get(f"/api/jobs/{job_id}/files/secret.txt").status_code == 404
    assert client.delete(f"/api/jobs/{job_id}").json()["deleted"] is True


def test_conditioning_single_call(fixture_png: bytes, client) -> None:
    """A raw (non-two-tone) render goes straight through with condition=true.

    The fixture is black-on-white, so key='dark' selects the metal; width_mm is
    derived from the crop, so only height_mm is supplied.
    """
    resp = client.post(
        "/api/jobs",
        files={"image": ("f.png", fixture_png, "image/png")},
        data={"height_mm": "15", "condition": "true", "color_key": "dark"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "approved"
    assert body["input"]["width_mm"] > 0  # derived from the crop
    assert "cutouts_svg" in body


def test_auth_gate_when_token_set(fixture_png: bytes, unauthorised_client, auth_configured) -> None:
    files = {"image": ("f.png", fixture_png, "image/png")}
    data = {"width_mm": "160", "height_mm": "15"}

    assert unauthorised_client.post("/api/jobs", files=files, data=data).status_code == 401
    ok = unauthorised_client.post(
        "/api/jobs", files=files, data=data,
        headers={"Authorization": f"Bearer {auth_configured}"},
    )
    assert ok.status_code == 200
    assert unauthorised_client.get("/api/health").status_code == 200  # health stays open


def _SHADED_OPENINGS(width: int) -> range:
    """x positions of the cut-outs punched into _shaded_render's bar."""
    return range(160, width - 140, 90)


def _shaded_render(width: int = 1200, height: int = 400) -> np.ndarray:
    """A charcoal-metal-on-beige render with ambient occlusion and a cast shadow.

    This is what the image model actually produces despite the prompt asking for
    flat warm brass on pure white, so conditioning has to survive it.
    """
    import cv2

    bg = np.array([244, 241, 234], np.float32)
    met = np.array([27, 26, 25], np.float32)
    bar = np.zeros((height, width), np.float32)
    cv2.rectangle(bar, (100, 120), (width - 100, height - 120), 1.0, -1)
    for x in _SHADED_OPENINGS(width):
        cv2.rectangle(bar, (x, 150), (x + 46, height - 150), 0.0, -1)
    bar = cv2.GaussianBlur(bar, (0, 0), 1.0)  # anti-aliasing

    img = bg * (1 - bar[..., None]) + met * bar[..., None]

    # Ambient occlusion darkens the background *inside* the openings; the cast
    # shadow falls on the background *outside* the silhouette. They are disjoint
    # regions -- stacking both on one pixel is not something a render does.
    silhouette = np.zeros_like(bar)
    cv2.rectangle(silhouette, (100, 120), (width - 100, height - 120), 1.0, -1)
    dist = cv2.distanceTransform((bar < 0.5).astype(np.uint8), cv2.DIST_L2, 5)
    ao = np.clip(1 - dist / 18.0, 0, 1) * (bar < 0.5) * (silhouette > 0.5)
    img *= (1 - 0.45 * ao)[..., None]
    shadow = cv2.GaussianBlur(np.roll(np.roll(silhouette, 34, 0), 16, 1), (0, 0), 20)
    img *= (1 - 0.35 * shadow * (silhouette < 0.5))[..., None]
    return np.clip(img, 0, 255).astype(np.uint8)


def _cutout_count(binary: np.ndarray) -> int:
    import cv2

    n, _, st, _ = cv2.connectedComponentsWithStats((binary == 255).astype(np.uint8), 8)
    return sum(1 for i in range(1, n) if st[i, cv2.CC_STAT_AREA] < 0.4 * binary.size)


def test_coverage_key_survives_shading_and_shadow() -> None:
    """Shading must not be rounded up into metal, and the cast shadow must not
    stretch the crop: the bar is 1000x160 px at 15mm tall, so width_mm = 93.75.
    Cropping to every above-threshold pixel instead of the largest metal blob
    pulls the shadow in and derives ~88mm -- a 6% mis-scale of the whole part."""
    from app.core.conditioning import condition_rgb

    rgb = _shaded_render()
    report: dict = {}
    binary, width_mm = condition_rgb(rgb, 15.0, report=report)

    assert width_mm == pytest.approx(93.75, abs=1.5)
    assert _cutout_count(binary) == len(_SHADED_OPENINGS(1200))  # every opening survives
    assert "despeckled" in report  # dropped design is reported, never silent


def test_choose_key_rejects_inverted_keys() -> None:
    """'warm' (r-b) scores the beige background above charcoal metal. Picking it
    would invert the mask, so the polarity check has to rule it out."""
    from app.core.conditioning import choose_key, condition_rgb

    rgb = _shaded_render()
    assert choose_key(rgb) != "warm"

    _, bad_width = condition_rgb(rgb, 15.0, key="warm")
    assert bad_width < 50.0  # the failure the polarity check exists to prevent
