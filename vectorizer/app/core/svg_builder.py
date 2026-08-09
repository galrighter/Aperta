"""Stage I — serialise Shapely geometry to the SVG output contract.

metal.svg   : black fill == remaining material.
cutouts.svg : black fill == material removed (matches the forme cutout contract,
              a single <g id="cutouts"> that the existing engine consumes).

When curve settings are supplied each ring is fitted with corner-aware cubic
Béziers (see curves.py) instead of being written out as a polyline. That fit is
the pipeline's smoothing step, so it happens here — once, on exactly the rings
that get emitted — and the fidelity gate rasterises the result and scores the
curves rather than a polygon that stood in for them.
"""

from __future__ import annotations

from dataclasses import dataclass

from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.geometry.polygon import orient

from .curves import CurveSettings, FittedRing, fit_ring

_PREC = 4


@dataclass(frozen=True)
class BuiltSvg:
    svg: str
    #: Anchors in the emitted path — the count score() prefers to keep small.
    anchor_count: int
    curve_count: int


def _fmt(v: float) -> str:
    return f"{v:.{_PREC}f}".rstrip("0").rstrip(".")


def _clamp(p: tuple[float, float], box: tuple[float, float]) -> tuple[float, float]:
    """Keep a control point inside the stock.

    Only control points are clamped, never the traced anchors: a fitted arm can
    reach past the sheet edge and bow the curve out with it, which is metal the
    stock does not have. Anchors are on the boundary by construction (the
    border snap put them there) and must not move.
    """
    w, h = box
    return (min(max(p[0], 0.0), w), min(max(p[1], 0.0), h))


def _ring_d(coords: list[tuple[float, float]]) -> str:
    pts = list(coords)
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if not pts:
        return ""
    head = f"M{_fmt(pts[0][0])} {_fmt(pts[0][1])}"
    rest = "".join(f"L{_fmt(x)} {_fmt(y)}" for x, y in pts[1:])
    return head + rest + "Z"


def _fitted_d(ring: FittedRing, box: tuple[float, float]) -> str:
    out = [f"M{_fmt(ring.start[0])} {_fmt(ring.start[1])}"]
    for seg in ring.segments:
        if seg[0] == "L":
            out.append(f"L{_fmt(seg[1][0])} {_fmt(seg[1][1])}")
        else:
            c1, c2, to = _clamp(seg[1], box), _clamp(seg[2], box), seg[3]
            out.append(
                f"C{_fmt(c1[0])} {_fmt(c1[1])} {_fmt(c2[0])} {_fmt(c2[1])} "
                f"{_fmt(to[0])} {_fmt(to[1])}"
            )
    return "".join(out) + "Z"


def _polygons(geom: BaseGeometry) -> list[Polygon]:
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]


def _path_d(
    geom: BaseGeometry, box: tuple[float, float], curves: CurveSettings | None
) -> tuple[str, int, int]:
    """Emit each polygon as exterior + holes, with orientation made explicit.

    Shapely does not guarantee ring orientation, so which subpaths read as
    holes depended on whatever the upstream operations happened to produce.
    `orient` fixes exteriors counter-clockwise and interiors clockwise, which
    makes the holes unambiguous under both the non-zero and even-odd fill
    rules — the consumer decides holes by winding, so this has to be right
    rather than declared.
    """
    parts: list[str] = []
    anchors = 0
    curved = 0
    for poly in _polygons(geom):
        p = orient(poly, sign=1.0)
        for ring in [p.exterior, *p.interiors]:
            coords = list(ring.coords)
            if curves is None:
                d = _ring_d(coords)
                anchors += max(len(coords) - 1, 0)
            else:
                fitted = fit_ring(coords, curves)
                d = _fitted_d(fitted, box)
                anchors += fitted.anchor_count
                curved += fitted.curve_count
            if d:
                parts.append(d)
    return "".join(parts), anchors, curved


def build_svg(
    geom: BaseGeometry,
    width_mm: float,
    height_mm: float,
    layer_id: str,
    curves: CurveSettings | None = None,
) -> BuiltSvg:
    d, anchors, curved = _path_d(geom, (width_mm, height_mm), curves)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {_fmt(width_mm)} {_fmt(height_mm)}">'
        # No fill-rule: the design-engine SVG contract allows only id and fill
        # on this layer, and with explicit winding above it is not needed.
        f'<g id="{layer_id}" fill="black">'
        f'<path d="{d}"/></g></svg>'
    )
    return BuiltSvg(svg=svg, anchor_count=anchors, curve_count=curved)


def build_metal_svg(
    metal: BaseGeometry, width_mm: float, height_mm: float, curves: CurveSettings | None = None
) -> BuiltSvg:
    return build_svg(metal, width_mm, height_mm, "metal", curves)


def build_cutouts_svg(
    cutouts: BaseGeometry, width_mm: float, height_mm: float, curves: CurveSettings | None = None
) -> BuiltSvg:
    return build_svg(cutouts, width_mm, height_mm, "cutouts", curves)
