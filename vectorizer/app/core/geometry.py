"""Stages G–H, J — scale pixel geometry to mm, clean it, derive cutouts."""

from __future__ import annotations

import math

from dataclasses import dataclass

from ..config import SETTINGS
from shapely import affinity
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.geometry.base import BaseGeometry
from shapely.validation import make_valid


@dataclass
class GeometryStats:
    path_count: int
    anchor_point_count: int
    self_intersections: int
    zero_area_rings: int
    open_paths: int


def _as_polygons(geom: BaseGeometry) -> list[Polygon]:
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    # GeometryCollection from make_valid — keep polygonal parts only
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon) and g.area > 0]


def scale_to_mm(
    geom_px: BaseGeometry,
    width_px: int,
    height_px: int,
    width_mm: float,
    height_mm: float,
) -> BaseGeometry:
    sx = width_mm / width_px
    sy = height_mm / height_px
    return affinity.scale(geom_px, xfact=sx, yfact=sy, origin=(0, 0))


def _snap_ring(coords, width_mm: float, height_mm: float, tol: float):
    out = []
    for x, y in coords:
        if abs(x) <= tol:
            x = 0.0
        elif abs(x - width_mm) <= tol:
            x = width_mm
        if abs(y) <= tol:
            y = 0.0
        elif abs(y - height_mm) <= tol:
            y = height_mm
        out.append((x, y))
    return out


def snap_to_bounds(
    geom: BaseGeometry, width_mm: float, height_mm: float, tol: float
) -> BaseGeometry:
    """Snap vertices within ``tol`` of a stock edge onto that edge.

    A raster contour of metal that runs to the image border stops one pixel
    short of the physical stock edge; without snapping, the re-rendered SVG
    loses a sliver there and max-deviation explodes even though IoU is fine.
    The strip's extreme edge *is* the stock boundary, so snapping is correct.
    """
    polys = _as_polygons(geom if geom.is_valid else make_valid(geom))
    snapped = []
    for p in polys:
        ext = _snap_ring(p.exterior.coords, width_mm, height_mm, tol)
        holes = [_snap_ring(r.coords, width_mm, height_mm, tol) for r in p.interiors]
        q = Polygon(ext, holes)
        if not q.is_valid:
            q = make_valid(q)
        if not q.is_empty and q.area > 0:
            snapped.append(q)
    if not snapped:
        return Polygon()
    from shapely.ops import unary_union

    out = unary_union(snapped)
    return out if out.is_valid else make_valid(out)


def cleanup(geom: BaseGeometry, min_ring_area_mm2: float = 1e-4) -> MultiPolygon:
    polys = _as_polygons(geom if geom.is_valid else make_valid(geom))
    kept = [p for p in polys if p.area >= min_ring_area_mm2]
    if not kept:
        return MultiPolygon()
    return MultiPolygon(kept) if len(kept) > 1 else MultiPolygon([kept[0]])


def _chaikin_ring(coords: list, iterations: int, max_cut_mm: float) -> list:
    """Corner-cutting with the cut distance clamped in millimetres.

    Plain Chaikin moves each corner by a quarter of the adjoining edge, which
    is the right amount for a raster staircase a couple of pixels long. On a
    long straight run it is catastrophic: the strip outline simplifies to four
    corners, so a quarter of an edge is tens of millimetres and two passes bend
    the rectangle into a lens. Clamping the cut to an absolute distance keeps
    staircase smoothing intact while leaving long straight edges straight.
    """
    pts = [(float(x), float(y)) for x, y in coords]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    for _ in range(iterations):
        n = len(pts)
        if n < 3:
            break
        nxt = []
        for i in range(n):
            px, py = pts[i]
            qx, qy = pts[(i + 1) % n]
            dx, dy = qx - px, qy - py
            length = math.hypot(dx, dy)
            # Short edge -> the classic quarter. Long edge -> only max_cut_mm.
            t = 0.25 if length <= 0 else min(0.25, max_cut_mm / length)
            nxt.append((px + t * dx, py + t * dy))
            nxt.append((px + (1.0 - t) * dx, py + (1.0 - t) * dy))
        pts = nxt
    return pts


def smooth_chaikin(geom: BaseGeometry, iterations: int, max_cut_mm: float | None = None) -> MultiPolygon:
    """Round jagged trace edges via Chaikin corner-cutting.

    Each pass replaces every vertex with two points along its edges, moving the
    boundary by at most max_cut_mm — enough to smooth raster staircases while
    staying close to the faithful trace (the fidelity gate still validates the
    result). Unlike raster blur it does not fatten thin metal bridges, and
    unlike unclamped corner-cutting it does not round off the strip outline.
    """
    if iterations <= 0:
        return cleanup(geom)
    cut = SETTINGS.max_smooth_cut_mm if max_cut_mm is None else max_cut_mm
    polys = _as_polygons(geom if geom.is_valid else make_valid(geom))
    out = []
    for p in polys:
        ext = _chaikin_ring(list(p.exterior.coords), iterations, cut)
        holes = [_chaikin_ring(list(r.coords), iterations, cut) for r in p.interiors]
        if len(ext) < 3:
            continue
        q = Polygon(ext, [h for h in holes if len(h) >= 3])
        if not q.is_valid:
            q = make_valid(q)
        if not q.is_empty and q.area > 0:
            out.append(q)
    if not out:
        return MultiPolygon()
    from shapely.ops import unary_union

    u = unary_union(out)
    # Chaikin leaves many near-collinear points; drop the redundant ones with a
    # tiny topology-preserving simplify (well below the fidelity budget).
    u = u.simplify(0.01, preserve_topology=True)
    return cleanup(u)


def cutouts_from_metal(metal: BaseGeometry, width_mm: float, height_mm: float) -> BaseGeometry:
    rect = box(0, 0, width_mm, height_mm)
    diff = rect.difference(metal)
    return diff if diff.is_valid else make_valid(diff)


def drop_thin_cutouts(cutouts: BaseGeometry, min_hole_mm: float) -> BaseGeometry:
    """Remove everything the cutter cannot make, using forme's minimum.

    Tracing a photographed pattern leaves hairlines along an edge — a 1.5x0.17mm
    sliver beside a leaf. They read as design in the SVG but are far below what
    the laser can open, so forme rejects the whole strip over one of them. The
    minimum is forme's number, passed in per run; we only apply it.

    **The erosion is the operation, not a test.** It used to be a predicate —
    keep the polygon if it still has area after being pulled in by half the
    minimum — and that only ever caught a hairline that was an opening *of its
    own*. A hairline that grows *out of* a real opening is part of that
    opening's polygon, the polygon is plainly wide enough, and the whole thing
    was kept with the tentacle attached.

    Measured on AP-0165 (14.8): six cutouts, none of them thin as a whole
    (4A/P from 4.1 to 13.4mm), every one of them carrying hairline tentacles off
    its tips. Nothing here dropped them, forme's V5 asks the same question the
    same way and passed them too — and V4 then failed all three candidates on
    the 0.2mm necks those tentacles pinched into the metal. The customer got one
    design instead of three, and every gate said the strip was fine.

    A morphological opening — erode by half the minimum, dilate back — removes
    exactly the parts narrower than the minimum and leaves the rest where it
    was, whether the thin part stands alone or hangs off something wide. The
    intersection afterwards is the guarantee that this only ever *removes*
    cutout: dilating rounds a sharp convex corner outward, and cutout the tracer
    never found is not ours to invent.

    A sharp tip of a real opening comes back rounded to the minimum's radius.
    That is not a loss — a 0.25mm inside corner is not a shape the cutter can
    make either.
    """
    if min_hole_mm <= 0:
        return cutouts
    r = min_hole_mm / 2
    kept: list = []
    for p in _as_polygons(cutouts):
        opened = p.buffer(-r).buffer(r)
        if opened.is_empty:
            continue
        kept.extend(_as_polygons(opened.intersection(p)))
    kept = [p for p in kept if not p.is_empty]
    if not kept:
        return MultiPolygon()
    return cleanup(MultiPolygon(kept) if len(kept) > 1 else kept[0])


def geometry_stats(geom: BaseGeometry) -> GeometryStats:
    polys = _as_polygons(geom)
    anchors = 0
    zero_area = 0
    for p in polys:
        anchors += len(p.exterior.coords) - 1
        for r in p.interiors:
            anchors += len(r.coords) - 1
            if Polygon(r).area == 0:
                zero_area += 1
    self_int = 0 if all(p.is_valid for p in polys) else 1
    # Shapely polygons are always closed rings, so open_paths is structurally 0
    return GeometryStats(
        path_count=len(polys),
        anchor_point_count=anchors,
        self_intersections=self_int,
        zero_area_rings=zero_area,
        open_paths=0,
    )
