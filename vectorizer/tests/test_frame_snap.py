"""Frame snapping — only where the frame really is the stock edge.

The crop in ``conditioning`` is tight to the metal's bounding box, so a piece
touches all four image borders whatever it was drawn like. Snapping every
contour vertex near a border onto it is right for a strip drawn edge to edge,
and wrong for a drawn silhouette: there it pulls a shallow curve flat and
writes the frame itself into the cut path — the straight tangent lines
reported on AP-0170, on lobes the design meant to be round.

These tests pin the separator (how much of a border the metal runs along) and
the effect on the outline itself.
"""

from __future__ import annotations

import io
import math

import numpy as np
import pytest
from PIL import Image, ImageDraw

from app.config import SETTINGS
from app.core import geometry, tracing
from app.core.conditioning import condition_png
from app.core.mask import analyse_and_mask, border_coverage, stock_edges
from app.core.validation import load_and_validate

W, H = 1536, 340
HEIGHT_MM = 18.0


def _png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _rectangular_strip() -> bytes:
    """The classic path: a blank drawn edge to edge, with three openings."""
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([60, 90, W - 60, H - 90], fill="black")
    for fx in (0.25, 0.5, 0.75):
        d.ellipse([W * fx - 110, H / 2 - 45, W * fx + 110, H / 2 + 45], fill="white")
    return _png(img)


def _lobed_cuff() -> bytes:
    """A story silhouette: broad rounded lobes tapering to the ends."""
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    cx = W / 2
    top, bottom = [], []
    for x in range(W + 1):
        u = (x - cx) / (W / 2)
        half = max(18.0, 120 * (1 - 0.55 * u * u) + 14 * math.cos(3 * math.pi * u))
        top.append((x, H / 2 - half))
        bottom.append((x, H / 2 + half))
    d.polygon(top + bottom[::-1], fill="black")
    for fx, fw, fh in ((0.22, 150, 62), (0.5, 95, 40), (0.78, 150, 62)):
        d.ellipse([cx * 2 * fx - fw, H / 2 - fh, cx * 2 * fx + fw, H / 2 + fh], fill="white")
    return _png(img)


def _traced(data: bytes):
    """(metal in mm before any snapping, width_mm, snap tolerance, source mask)."""
    png, width_mm, _key, _report = condition_png(data, HEIGHT_MM, "coverage")
    image = load_and_validate(png, width_mm, HEIGHT_MM)
    mm_per_px = 0.5 * (width_mm / image.width_px + HEIGHT_MM / image.height_px)
    mask = analyse_and_mask(image, "metal", 0, SETTINGS.turn_policy).clean_mask
    geom_px = tracing.trace(mask, 0.05 / mm_per_px, SETTINGS.tracer_backend)
    geom_mm = geometry.scale_to_mm(geom_px, image.width_px, image.height_px, width_mm, HEIGHT_MM)
    return geom_mm, width_mm, 1.5 * mm_per_px, mask


def _on_frame_mm(geom, width_mm: float, eps: float = 1e-6) -> float:
    """Total length of outline lying exactly on a frame edge."""
    total = 0.0
    for poly in geometry._as_polygons(geom):
        for ring in [poly.exterior, *poly.interiors]:
            pts = list(ring.coords)
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                horizontal = abs(y0 - y1) <= eps and (abs(y0) <= eps or abs(y0 - HEIGHT_MM) <= eps)
                vertical = abs(x0 - x1) <= eps and (abs(x0) <= eps or abs(x0 - width_mm) <= eps)
                if horizontal:
                    total += abs(x1 - x0)
                elif vertical:
                    total += abs(y1 - y0)
    return total


def test_a_strip_drawn_edge_to_edge_keeps_every_stock_edge():
    _geom, _w, _tol, mask = _traced(_rectangular_strip())
    assert set(stock_edges(mask)) == {"top", "bottom", "left", "right"}
    assert min(border_coverage(mask).values()) > 0.9


def test_a_drawn_silhouette_has_no_stock_edge():
    """It touches all four borders — the crop guarantees that — but runs along none."""
    _geom, _w, _tol, mask = _traced(_lobed_cuff())
    assert stock_edges(mask) == ()
    assert max(border_coverage(mask).values()) < 0.5


def test_the_frame_is_not_written_into_a_silhouette_that_only_grazes_it():
    geom, width_mm, tol, mask = _traced(_lobed_cuff())
    unchanged = geometry.snap_to_bounds(geom, width_mm, HEIGHT_MM, tol, edges=stock_edges(mask))
    every_edge = geometry.snap_to_bounds(geom, width_mm, HEIGHT_MM, tol)

    # Snapping every border roughly doubles the dead-straight outline; gating
    # it leaves the trace exactly as it came off the raster.
    assert _on_frame_mm(every_edge, width_mm) > 1.7 * _on_frame_mm(unchanged, width_mm)
    assert _on_frame_mm(unchanged, width_mm) == pytest.approx(
        _on_frame_mm(geometry.cleanup(geom), width_mm), abs=0.01
    )


def test_a_real_stock_edge_is_still_snapped():
    geom, width_mm, tol, mask = _traced(_rectangular_strip())
    gated = geometry.snap_to_bounds(geom, width_mm, HEIGHT_MM, tol, edges=stock_edges(mask))
    every_edge = geometry.snap_to_bounds(geom, width_mm, HEIGHT_MM, tol)
    assert _on_frame_mm(gated, width_mm) == pytest.approx(_on_frame_mm(every_edge, width_mm), abs=1e-6)


def test_border_coverage_reads_the_four_borders():
    mask = np.zeros((10, 20), np.uint8)
    mask[0, :10] = 255      # half the top border
    mask[:, 0] = 255        # all of the left border
    cover = border_coverage(mask)
    assert cover["top"] == pytest.approx(0.5)
    assert cover["left"] == pytest.approx(1.0)
    assert cover["bottom"] == pytest.approx(0.05)   # the one pixel the left column puts there
    assert cover["right"] == pytest.approx(0.0)
