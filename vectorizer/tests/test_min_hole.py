"""The minimum-opening filter — forme's number, applied here.

Tracing a photographed pattern leaves hairlines beside the real openings — and,
as AP-0165 showed, *out of* them. They are far below what the cutter can make,
so forme rejects the whole strip over one of them.

These tests pin the rule: what is narrower than the minimum is subtracted, part
by part, whether it stands alone or hangs off something wide — and a shape with
no such part comes back untouched.
"""

from __future__ import annotations


import pytest
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


def test_a_clean_opening_comes_back_untouched():
    """The corners of a design with nothing wrong with it are not rewritten.

    Erode-and-dilate cannot restore a convex corner sharper than the radius it
    was eroded by, so subtracting everything the erosion loses would round every
    corner of every cutout in the catalogue — 0.013mm² a corner, for nothing.
    Only thin parts big enough to have been drawn are subtracted, and a shape
    that has none comes back identical, corner for corner.
    """
    original = box(0, 0, 4, 2)
    kept = drop_thin_cutouts(MultiPolygon([original]), 0.5)
    assert kept.area == pytest.approx(original.area, abs=1e-9)
    assert kept.equals(original)


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


# AP-0165 (14.8) — the case the predicate could not see.
#
# Every hairline in that run grew *out of* a real opening instead of standing
# beside one. As one polygon it is obviously wide enough, so the filter kept it
# whole, forme's V5 asked the same question and answered the same way, and V4
# then failed all three candidates on the necks the tentacles pinched into the
# metal. One design reached the customer instead of three.


def test_a_tentacle_on_a_wide_opening_is_cut_off():
    # A 4x2mm opening with a 12x0.2mm hairline running out of its right edge.
    leaf = box(0, 0, 4, 2)
    tentacle = box(4, 0.9, 16, 1.1)
    kept = drop_thin_cutouts(leaf.union(tentacle), 0.5)
    assert kept.area == pytest.approx(leaf.area, abs=0.05)
    assert kept.bounds[2] == pytest.approx(4.0, abs=0.3)


def test_the_opening_it_hangs_off_is_not_dropped_with_it():
    # The other half of the same rule: removing the thin part must not remove
    # the thing it was attached to.
    kept = drop_thin_cutouts(box(0, 0, 4, 2).union(box(4, 0.9, 16, 1.1)), 0.5)
    assert not kept.is_empty


def test_it_never_adds_cutout_the_tracer_did_not_find():
    # Dilating back rounds a sharp convex corner outward, and a cutout the
    # tracer never found is not ours to invent — so the result is only ever a
    # subtraction from what came in.
    original = box(0, 0, 4, 2).union(box(4, 0.9, 16, 1.1))
    kept = drop_thin_cutouts(original, 0.5)
    assert kept.difference(original).area < 1e-9


# --- AP-0170 (14.8): the frame gate -----------------------------------------
# The background around a drawn silhouette is a cutout polygon that touches the
# frame, and the gaps between the teeth of a fringed edge are its "thin parts".
# Measuring it part by part filled those gaps with metal — welding the trace's
# fringe into a solid skin on the outline. A border-touching region is not a
# hole; it keeps the predicate semantics it always had.


def _fringed_background():
    """Top background band with teeth hanging down, gaps 0.3mm — sub-minimum."""
    from shapely.geometry import Polygon

    pts = [(0.0, 0.0), (160.0, 0.0), (160.0, 2.0)]
    x = 150.0
    while x > 20:
        pts += [(x, 2.0), (x, 3.2), (x - 0.3, 3.2), (x - 0.3, 2.0)]
        x -= 3.0
    pts.append((0.0, 2.0))
    return Polygon(pts).buffer(0)


def test_a_fringed_outer_edge_is_not_welded_shut():
    from app.core.geometry import drop_thin_cutouts

    bg = _fringed_background()
    cutouts = MultiPolygon([bg, box(40, 8, 44, 10)])
    kept = drop_thin_cutouts(cutouts, 0.5, 160.0, 15.0)
    # The border region comes back whole — the sub-minimum gaps stay open.
    assert abs(sum(_areas(kept)) - sum(_areas(cutouts))) < 0.01


def test_an_enclosed_tentacle_is_still_cut_with_the_gate_on():
    from shapely.ops import unary_union
    from app.core.geometry import drop_thin_cutouts

    leaf_with_tentacle = unary_union([box(40, 8, 44, 10), box(44, 8.9, 56, 9.1)])
    cutouts = MultiPolygon([_fringed_background(), leaf_with_tentacle])
    kept = drop_thin_cutouts(cutouts, 0.5, 160.0, 15.0)
    removed = sum(_areas(cutouts)) - sum(_areas(kept))
    # Only the 2.4mm² tentacle goes; the fringe on the frame is untouched.
    assert 2.0 < removed < 2.6


def test_without_the_frame_the_measure_is_ungated():
    from app.core.geometry import drop_thin_cutouts

    bg = _fringed_background()
    kept = drop_thin_cutouts(MultiPolygon([bg]), 0.5)
    # Callers that do not say where the frame is get the part-by-part measure
    # everywhere — the pre-gate behaviour, pinned so the gate stays a choice.
    assert sum(_areas(kept)) < bg.area
