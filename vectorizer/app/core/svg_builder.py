"""Stage I — serialise Shapely geometry to the SVG output contract.

metal.svg   : black fill == remaining material.
cutouts.svg : black fill == material removed (matches the forme cutout contract,
              a single <g id="cutouts"> that the existing engine consumes).
"""

from __future__ import annotations

from shapely.geometry.polygon import orient
from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

_PREC = 4


def _fmt(v: float) -> str:
    return f"{v:.{_PREC}f}".rstrip("0").rstrip(".")


def _ring_d(coords: list[tuple[float, float]]) -> str:
    pts = list(coords)
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if not pts:
        return ""
    head = f"M{_fmt(pts[0][0])} {_fmt(pts[0][1])}"
    rest = "".join(f"L{_fmt(x)} {_fmt(y)}" for x, y in pts[1:])
    return head + rest + "Z"


def _polygons(geom: BaseGeometry) -> list[Polygon]:
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]


def _path_d(geom: BaseGeometry) -> str:
    """Emit each polygon as exterior + holes, with orientation made explicit.

    Shapely does not guarantee ring orientation, so which subpaths read as
    holes depended on whatever the upstream operations happened to produce.
    `orient` fixes exteriors counter-clockwise and interiors clockwise, which
    makes the holes unambiguous under both the non-zero and even-odd fill
    rules — the consumer decides holes by winding, so this has to be right
    rather than declared.
    """
    parts = []
    for poly in _polygons(geom):
        p = orient(poly, sign=1.0)
        parts.append(_ring_d(list(p.exterior.coords)))
        for interior in p.interiors:
            parts.append(_ring_d(list(interior.coords)))
    return "".join(x for x in parts if x)


def build_svg(geom: BaseGeometry, width_mm: float, height_mm: float, layer_id: str) -> str:
    d = _path_d(geom)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {_fmt(width_mm)} {_fmt(height_mm)}">'
        # No fill-rule: the design-engine SVG contract allows only id and fill
        # on this layer, and with explicit winding above it is not needed.
        f'<g id="{layer_id}" fill="black">'
        f'<path d="{d}"/></g></svg>'
    )


def build_metal_svg(metal: BaseGeometry, width_mm: float, height_mm: float) -> str:
    return build_svg(metal, width_mm, height_mm, "metal")


def build_cutouts_svg(cutouts: BaseGeometry, width_mm: float, height_mm: float) -> str:
    return build_svg(cutouts, width_mm, height_mm, "cutouts")
