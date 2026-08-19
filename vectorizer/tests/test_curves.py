"""Corner-aware Bézier fitting: corners survive, staircases don't."""

from __future__ import annotations

import json
import math
import pathlib

import numpy as np
import pytest
from shapely.geometry import Polygon

from app.core import svg_builder
from app.core.curves import CurveSettings, _cubic_at, fit_ring

S = CurveSettings(max_error_mm=0.05, corner_deg=55.0, window_mm=0.3)


def _sample(ring, step: float = 0.005) -> list[tuple[float, float]]:
    """Walk the fitted ring back into a polyline ~``step`` mm dense, so the fit
    can be measured against the points it was fitted to.

    Lines are interpolated too — sampling only their endpoints would report a
    straight run as a huge error. Density follows segment length rather than a
    fixed count per segment, or a fit that degenerates to hundreds of short
    lines produces hundreds of thousands of sample points.
    """
    out = [ring.start]
    cur = ring.start
    for seg in ring.segments:
        to = seg[-1]
        span = math.dist(cur, to) if seg[0] == "L" else math.dist(cur, seg[1]) + math.dist(seg[1], seg[2]) + math.dist(seg[2], to)
        n = max(4, min(400, math.ceil(span / step)))
        if seg[0] == "L":
            out.extend((cur[0] + (to[0] - cur[0]) * i / n, cur[1] + (to[1] - cur[1]) * i / n) for i in range(1, n + 1))
        else:
            out.extend(_cubic_at(cur, seg[1], seg[2], to, i / n) for i in range(1, n + 1))
        cur = to
    return out


def _max_distance(points, curve) -> float:
    """Furthest any traced point sits from the emitted outline.

    Chunked because the fit legitimately degenerates to one segment per input
    point at a budget below the pixel step, and the full cross product of those
    two point sets does not fit in memory.
    """
    a = np.asarray(points, float)
    b = np.asarray(curve, float)[None, :, :]
    worst = 0.0
    for i in range(0, len(a), 64):
        chunk = a[i : i + 64][:, None, :]
        worst = max(worst, float(np.linalg.norm(chunk - b, axis=2).min(axis=1).max()))
    return worst


def test_circle_becomes_a_handful_of_curves() -> None:
    """314 traced points describing one arc should not stay 314 line segments."""
    n = 314
    circle = [(5 * math.cos(2 * math.pi * i / n), 5 * math.sin(2 * math.pi * i / n)) for i in range(n)]
    ring = fit_ring(circle, S)

    assert ring.curve_count == len(ring.segments)  # no straight pieces on a circle
    assert len(ring.segments) <= 12
    assert _max_distance(circle, _sample(ring)) <= S.max_error_mm


def test_rectangle_keeps_its_corners_and_its_straight_edges() -> None:
    """The stock outline must come out as four exact corners joined by lines.

    This is the case blind corner-cutting could never get right: Chaikin bent
    the strip outline into a lens because it cannot tell a 90° corner from a
    one-pixel jag.
    """
    rect: list[tuple[float, float]] = []
    for x in np.arange(0, 20, 0.1):
        rect.append((float(x), 0.0))
    for y in np.arange(0, 10, 0.1):
        rect.append((20.0, float(y)))
    for x in np.arange(20, 0, -0.1):
        rect.append((float(x), 10.0))
    for y in np.arange(10, 0, -0.1):
        rect.append((0.0, float(y)))

    ring = fit_ring(rect, S)
    assert [s[0] for s in ring.segments] == ["L", "L", "L", "L"]
    corners = {ring.start, *(s[-1] for s in ring.segments)}
    assert corners == {(0.0, 0.0), (20.0, 0.0), (20.0, 10.0), (0.0, 10.0)}


def test_staircase_collapses_but_the_corners_are_not() -> None:
    """A 45° raster staircase closed into a triangle.

    401 traced vertices, every one of them a 90° turn, describe three sides —
    and the fit has to say so. Both right-angles survive; the staircase itself
    is inside the budget of the chord it is climbing, so it becomes that chord.
    """
    stair: list[tuple[float, float]] = []
    for i in range(200):  # 0.05mm steps — a real pixel staircase at 3200px/160mm
        stair.append((i * 0.05, i * 0.05))
        stair.append(((i + 1) * 0.05, i * 0.05))
    stair.append((10.0, 0.0))

    ring = fit_ring(stair, S)
    assert len(ring.segments) <= 6  # not 401
    assert _max_distance(stair, _sample(ring)) <= S.max_error_mm
    # the right-angle at (10, 0) is a real corner and must survive exactly
    assert (10.0, 0.0) in {ring.start, *(s[-1] for s in ring.segments)}


def test_a_wavy_edge_becomes_curves_not_facets() -> None:
    """The case the whole fit exists for: a curved edge digitised onto a pixel
    grid. The staircase must go, the wave must stay, and it must cost curves."""
    step = 0.05
    wave: list[tuple[float, float]] = []
    for i in range(400):
        x = i * step
        y = 3.0 + 1.5 * math.sin(x)
        wave.append((round(x / step) * step, round(y / step) * step))  # onto the grid
    wave.append((20.0, 0.0))
    wave.append((0.0, 0.0))

    ring = fit_ring(wave, S)
    assert ring.curve_count >= 4  # a sine is not four straight lines
    assert len(ring.segments) <= 40  # nor is it 400 of them
    assert _max_distance(wave, _sample(ring)) <= 2 * S.max_error_mm


def test_tight_budget_refuses_to_smooth() -> None:
    """An error budget below the pixel step must reproduce the staircase.

    The budget is the promise; a fitter that smooths anyway would be deciding
    fidelity on looks, which is exactly what this service does not do.
    """
    stair: list[tuple[float, float]] = []
    for i in range(60):
        stair.append((i * 0.05, i * 0.05))
        stair.append(((i + 1) * 0.05, i * 0.05))
    stair.append((3.0, 0.0))

    tight = fit_ring(stair, CurveSettings(max_error_mm=0.002, corner_deg=55.0, window_mm=0.3))
    loose = fit_ring(stair, S)
    assert len(tight.segments) > 4 * len(loose.segments)
    assert _max_distance(stair, _sample(tight)) <= 0.01


@pytest.mark.parametrize("budget", [0.002, 0.02, 0.05, 0.2])
def test_the_error_budget_is_a_promise(budget: float) -> None:
    """Whatever the budget, no emitted point may be further than it from the
    trace. The fidelity gate is entitled to rely on this: it is the difference
    between a smoothing step and a redrawing step.
    """
    blob: list[tuple[float, float]] = []
    for i in range(400):  # a lumpy closed curve, digitised onto a 0.05mm grid
        a = 2 * math.pi * i / 400
        r = 6 + 1.2 * math.sin(3 * a) + 0.4 * math.cos(7 * a)
        blob.append((round(r * math.cos(a) / 0.05) * 0.05, round(r * math.sin(a) / 0.05) * 0.05))

    ring = fit_ring(blob, CurveSettings(max_error_mm=budget, corner_deg=55.0, window_mm=0.3))
    # The outline is measured against a polyline sampled every `step`, so the
    # measurement itself is only good to `step`; the budget is what matters.
    step = min(0.005, budget / 4)
    assert _max_distance(blob, _sample(ring, step)) <= budget + step


def test_degenerate_rings_do_not_raise() -> None:
    for coords in ([], [(0.0, 0.0)], [(0.0, 0.0), (1.0, 1.0)], [(2.0, 2.0)] * 5):
        ring = fit_ring(coords, S)
        assert ring.segments  # always emits something closable


def test_svg_carries_curves_and_clamps_control_points_to_the_stock() -> None:
    """A curve arm may not reach past the sheet edge — that is metal we lack."""
    n = 240
    disc = Polygon(
        [(8 + 8 * math.cos(2 * math.pi * i / n), 5 + 5 * math.sin(2 * math.pi * i / n)) for i in range(n)]
    )
    built = svg_builder.build_metal_svg(disc, 16.0, 10.0, S)

    assert "C" in built.svg and built.curve_count > 0
    assert built.anchor_count < n
    numbers = [
        float(v)
        for v in built.svg.rsplit('d="', 1)[1].split('"')[0].replace("M", " ").replace("L", " ")
        .replace("C", " ").replace("Z", " ").split()
    ]
    xs, ys = numbers[0::2], numbers[1::2]
    assert min(xs) >= -1e-9 and max(xs) <= 16.0 + 1e-9
    assert min(ys) >= -1e-9 and max(ys) <= 10.0 + 1e-9


def test_svg_without_curve_settings_is_the_old_polyline() -> None:
    square = Polygon([(0, 0), (4, 0), (4, 4), (0, 4)])
    built = svg_builder.build_metal_svg(square, 4.0, 4.0)
    assert "C" not in built.svg
    assert built.curve_count == 0
    assert built.svg.count("M") == built.svg.count("Z") == 1


@pytest.mark.parametrize("layer,fn", [("metal", svg_builder.build_metal_svg),
                                      ("cutouts", svg_builder.build_cutouts_svg)])
def test_fitted_svg_still_closes_every_subpath(layer: str, fn) -> None:
    ring = Polygon([(0, 0), (10, 0), (10, 6), (0, 6)], [[(2, 2), (4, 2), (4, 4), (2, 4)]])
    built = fn(ring, 10.0, 6.0, S)
    assert f'id="{layer}"' in built.svg
    d = built.svg.rsplit('d="', 1)[1].split('"')[0]
    assert d.count("M") == d.count("Z") == 2  # exterior + hole


def test_a_fitted_ring_never_crosses_itself() -> None:
    """The fit may smooth, but it may not tie a knot.

    A cubic whose control arm runs longer than its chord loops back over
    itself. The ring is still closed and still has the right area, so nothing
    above notices: `geometry_stats` counts self-intersections on the traced
    polygon *before* this fit runs, and the fidelity gate scores area — a loop
    of a few thousandths of a mm² moves IoU by 0.0001.

    What it costs is not cosmetic. The boolean union downstream resolves the
    crossing into a main polygon plus hairline artefacts, and where the loop
    sits the outline bulges into the neighbouring rib. AP-0317 (33 near-parallel
    slots) reached the customer with two ribs of 2.8mm cut to 0.74mm and 1.12mm
    while every other rib in the piece stayed at 2.8.

    The fixture is one of that design's own traced rings — the shape is what
    matters here, and an analytic curve does not reproduce it: a real trace
    carries the raster step, and it is the near-collinear runs between steps
    that send the least-squares arm running.
    """
    ring = json.loads((pathlib.Path(__file__).parent / "fixtures_knotted_ring.json").read_text())
    fitted = fit_ring([tuple(p) for p in ring], CurveSettings(max_error_mm=0.025, corner_deg=55.0, window_mm=0.3))
    assert Polygon(_sample(fitted)).exterior.is_simple, "the fitted ring crosses itself"
