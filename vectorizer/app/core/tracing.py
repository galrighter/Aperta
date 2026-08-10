"""Stage F — tracing backends behind a single interface.

Both backends return a Shapely geometry (the *metal* region) in **pixel**
coordinates; scaling to millimetres happens in geometry.py. The OpenCV
backend is the robust baseline (guaranteed closed rings, correct hole/island
nesting via RETR_TREE). VTracer produces smoother spline outlines but its SVG
needs parsing/flattening — it is wired here as a selectable backend and will
be tuned once we see real generated images.
"""

from __future__ import annotations

import os
import tempfile

import cv2
import numpy as np
from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from shapely.validation import make_valid

#: Sub-pixel step for reading VTracer's splines back, and a cap so one huge
#: subpath cannot blow the point budget for the rest of the pipeline.
_VTRACER_SAMPLE_PX = 0.5
_VTRACER_MAX_SAMPLES = 20000


def _contour_points(cnt: np.ndarray, tolerance_px: float) -> np.ndarray:
    approx = cv2.approxPolyDP(cnt, max(tolerance_px, 0.01), True)
    return approx.reshape(-1, 2)


def _depth(hierarchy: np.ndarray, idx: int) -> int:
    depth = 0
    parent = hierarchy[idx][3]
    while parent != -1:
        depth += 1
        parent = hierarchy[parent][3]
    return depth


def trace_opencv(mask: np.ndarray, tolerance_px: float) -> BaseGeometry:
    """Trace a binary mask (255 == metal) into a Shapely (Multi)Polygon.

    Uses RETR_TREE so nesting is preserved: even-depth contours are solids,
    their odd-depth children are holes, and islands inside holes come back as
    their own solids. Unioning the solids reassembles the correct topology.
    """
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return Polygon()
    hierarchy = hierarchy[0]

    solids: list[BaseGeometry] = []
    for i, cnt in enumerate(contours):
        if _depth(hierarchy, i) % 2 != 0:
            continue  # odd depth == hole, handled as a child below
        ext = _contour_points(cnt, tolerance_px)
        if len(ext) < 3:
            continue
        holes = []
        child = hierarchy[i][2]  # first_child
        while child != -1:
            hpts = _contour_points(contours[child], tolerance_px)
            if len(hpts) >= 3:
                holes.append(hpts)
            child = hierarchy[child][0]  # next sibling
        poly = Polygon(ext, holes)
        if not poly.is_valid:
            poly = make_valid(poly)
        if not poly.is_empty and poly.area > 0:
            solids.append(poly)

    if not solids:
        return Polygon()
    geom = unary_union(solids)
    return geom if geom.is_valid else make_valid(geom)


def trace_vtracer(mask: np.ndarray, tolerance_px: float) -> BaseGeometry:
    """Trace via VTracer (binary/spline) and sample its splines finely.

    VTracer emits filled black paths on the foreground. Sampling used to step by
    ``tolerance_px``, which threw away most of what VTracer had worked out: the
    simplification tolerance is a *smoothing* choice, and spending it here meant
    a coarse polyline stood in for the spline from this point on, with an eighth
    of a subpath as the floor for short rings. Sampling at a fixed sub-pixel
    step keeps the spline's shape intact and leaves the smoothing decision to
    the curve fit in svg_builder, where it is corner-aware and where the
    fidelity gate can actually score it.
    """
    import vtracer  # local import: heavy Rust extension
    from svgpathtools import parse_path, svg2paths

    with tempfile.TemporaryDirectory() as td:
        in_png = os.path.join(td, "in.png")
        out_svg = os.path.join(td, "out.svg")
        # VTracer wants an RGB/RGBA image; metal (255) rendered as black on white
        rgb = np.where(mask[:, :, None] > 0, 0, 255).astype(np.uint8).repeat(3, axis=2)
        cv2.imwrite(in_png, rgb)
        vtracer.convert_image_to_svg_py(
            in_png,
            out_svg,
            colormode="binary",
            mode="spline",
            filter_speckle=0,
            corner_threshold=60,
            path_precision=4,
        )
        paths, _attrs = svg2paths(out_svg)

    rings: list[np.ndarray] = []
    for path in paths:
        for sub in path.continuous_subpaths():
            n = int(np.clip(sub.length() / _VTRACER_SAMPLE_PX, 8, _VTRACER_MAX_SAMPLES))
            pts = np.array([[p.real, p.imag] for p in (sub.point(t / n) for t in range(n + 1))])
            if len(pts) >= 3:
                rings.append(pts)

    # even-odd assembly by containment/area
    polys = [Polygon(r) for r in rings]
    polys = [make_valid(p) if not p.is_valid else p for p in polys if p.area > 0]
    if not polys:
        return Polygon()
    geom = unary_union(polys)
    return geom if geom.is_valid else make_valid(geom)


def trace(mask: np.ndarray, tolerance_px: float, backend: str) -> BaseGeometry:
    if backend == "vtracer":
        return trace_vtracer(mask, tolerance_px)
    return trace_opencv(mask, tolerance_px)
