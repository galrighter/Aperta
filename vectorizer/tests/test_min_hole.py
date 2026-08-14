"""The minimum-opening filter — forme's number, applied here.

Tracing a photographed pattern leaves hairlines beside the real openings. They
are far below what the cutter can make, so forme rejects the whole strip over
one of them. These tests pin the rule: an opening survives only if it still has
area after being pulled in by half the minimum on every side.
"""

from __future__ import annotations

import math

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
    assert len(_areas(kept)) == 1
    # 8.0 minus the four corner fillets — see the next test.
    assert kept.area == pytest.approx(7.946, abs=0.002)


def test_a_kept_opening_comes_back_with_filleted_corners():
    """The visible cost of removing thin parts by opening instead of by vote.

    Erode-then-dilate cannot restore a corner sharper than the radius it was
    eroded by, so every kept opening comes back with its corners rounded to
    0.25mm. That is deliberate and it is small: 0.013mm² per corner, well inside
    the curve fit's own error budget, and an inside corner that sharp is not a
    shape the cutter makes cleanly anyway.

    It is pinned here because it is the one way this filter now touches geometry
    that has nothing wrong with it — a regression in that number is a change in
    every run, not only the broken ones.
    """
    cutouts = MultiPolygon([box(0, 0, 3, 0.6)])
    kept = drop_thin_cutouts(cutouts, 0.5)
    assert kept.area == pytest.approx(1.8 - 4 * 0.0625 * (1 - math.pi / 4), abs=0.002)


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
    # The opening stays (rounded corners cost it a little); the tentacle goes.
    assert 7.5 < kept.area < 8.0
    assert kept.bounds[2] < 4.3


def test_the_opening_it_hangs_off_is_not_dropped_with_it():
    # The other half of the same rule: removing the thin part must not remove
    # the thing it was attached to.
    kept = drop_thin_cutouts(box(0, 0, 4, 2).union(box(4, 0.9, 16, 1.1)), 0.5)
    assert not kept.is_empty


def test_it_never_adds_cutout_the_tracer_did_not_find():
    # Dilating back rounds a sharp convex corner outward. Clipping to the
    # original is what keeps the piece from quietly growing an opening.
    original = box(0, 0, 4, 2)
    kept = drop_thin_cutouts(original, 0.5)
    assert kept.difference(original).area < 1e-9
