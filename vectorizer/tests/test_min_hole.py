"""The minimum-opening filter — forme's number, applied here.

Tracing a photographed pattern leaves hairlines beside the real openings. They
are far below what the cutter can make, so forme rejects the whole strip over
one of them. These tests pin the rule: an opening survives only if it still has
area after being pulled in by half the minimum on every side.
"""

from __future__ import annotations

from shapely.geometry import MultiPolygon, box

from app.core.geometry import drop_thin_cutouts


def _areas(geom) -> list[float]:
    if geom.is_empty:
        return []
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    return sorted(round(p.area, 4) for p in polys)


def test_drops_a_sliver_and_keeps_the_opening_beside_it():
    # The pair measured in a real render: a 4x2mm leaf and the 1.5x0.17mm
    # hairline the tracer left along its edge.
    cutouts = MultiPolygon([box(0, 0, 4, 2), box(5, 0, 6.5, 0.17)])
    kept = drop_thin_cutouts(cutouts, 0.5)
    assert _areas(kept) == [8.0]


def test_keeps_an_opening_exactly_above_the_minimum():
    cutouts = MultiPolygon([box(0, 0, 3, 0.6)])
    assert _areas(drop_thin_cutouts(cutouts, 0.5)) == [1.8]


def test_a_zero_minimum_keeps_everything():
    cutouts = MultiPolygon([box(0, 0, 4, 2), box(5, 0, 6.5, 0.17)])
    assert len(_areas(drop_thin_cutouts(cutouts, 0.0))) == 2


def test_all_slivers_leaves_no_cutouts():
    cutouts = MultiPolygon([box(0, 0, 2, 0.1), box(3, 0, 5, 0.2)])
    assert drop_thin_cutouts(cutouts, 0.5).is_empty


def test_length_does_not_rescue_a_thin_opening():
    # A long hairline has plenty of area; the erosion still empties it, which is
    # the point — area is not the test, width is.
    cutouts = MultiPolygon([box(0, 0, 50, 0.3)])
    assert drop_thin_cutouts(cutouts, 0.5).is_empty
