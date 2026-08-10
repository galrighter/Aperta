"""Zero-width diagonal touches become an explicit, reported decision."""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.core.mask import TURN_POLICIES, resolve_diagonal_pinches


def _components(mask: np.ndarray) -> int:
    n, _ = cv2.connectedComponents((mask > 0).astype(np.uint8), 8)
    return n - 1


def _small_parts_in_open_field() -> np.ndarray:
    """Two small metal parts meeting at exactly one point on a wide open field.

    Metal is what is scarce here, so its connection is the fragile feature.
    """
    m = np.zeros((80, 80), np.uint8)
    m[37:40, 37:40] = 255
    m[40:43, 40:43] = 255
    return m


def _hairline_slit_through_solid_metal() -> np.ndarray:
    """A solid plate with a two-pixel diagonal nick — the opening is what is
    scarce, and it is the opening that is pinched to nothing."""
    m = np.full((80, 80), 255, np.uint8)
    m[:6, :] = m[-6:, :] = m[:, :6] = m[:, -6:] = 0  # a plate, not the whole frame
    m[39, 39] = 0
    m[40, 40] = 0
    return m


def test_opencv_silently_calls_a_zero_width_touch_connected() -> None:
    """The behaviour this exists to make visible: one 'piece' with no bridge."""
    assert _components(_small_parts_in_open_field()) == 1


def test_minority_keeps_a_scarce_metal_connection() -> None:
    """Metal is the local minority, so it wins the point — and gets one honest
    pixel of width instead of zero."""
    src = _small_parts_in_open_field()
    out, report = resolve_diagonal_pinches(src, "minority")
    assert report["found"] == 1
    assert report["joined"] == 1 and report["separated"] == 0
    assert _components(out) == 1
    assert int((out > 0).sum()) == int((src > 0).sum()) + 1


def test_minority_keeps_a_scarce_opening_open() -> None:
    """The mirror case: metal dominates, so the *opening* wins the point. The
    slit stays a slit instead of being sealed into an uncuttable hairline."""
    src = _hairline_slit_through_solid_metal()
    out, report = resolve_diagonal_pinches(src, "minority")
    assert report["found"] == 1
    assert report["separated"] == 1 and report["joined"] == 0
    assert int((out == 0).sum()) == int((src == 0).sum()) + 1


@pytest.mark.parametrize(
    "policy,expected_components",
    [("metal", 1), ("cutout", 2), ("minority", 1), ("majority", 2), ("none", 1)],
)
def test_explicit_policies(policy: str, expected_components: int) -> None:
    out, report = resolve_diagonal_pinches(_small_parts_in_open_field(), policy)
    assert report["policy"] == policy
    assert _components(out) == expected_components


def test_none_still_counts_what_it_did_not_decide() -> None:
    """'switched off' and 'nothing to decide' must not look the same."""
    _, report = resolve_diagonal_pinches(_small_parts_in_open_field(), "none")
    assert report["found"] == 1
    assert report["joined"] == 0 and report["separated"] == 0


def test_no_false_positives_on_ordinary_shapes() -> None:
    """A staircase along the edge of a solid shape is not a pinch: three of the
    four cells are metal there, so nothing is pinched to zero width."""
    for shape in (
        cv2.circle(np.zeros((80, 80), np.uint8), (40, 40), 25, 255, -1),
        cv2.rectangle(np.zeros((80, 80), np.uint8), (10, 10), (60, 50), 255, -1),
        cv2.ellipse(np.zeros((80, 80), np.uint8), (40, 40), (30, 12), 33, 0, 360, 255, -1),
    ):
        _, report = resolve_diagonal_pinches(shape, "minority")
        assert report["found"] == 0


def test_every_policy_is_accepted_and_preserves_shape() -> None:
    blob = cv2.circle(np.zeros((60, 60), np.uint8), (30, 30), 18, 255, -1)
    for policy in TURN_POLICIES:
        out, _ = resolve_diagonal_pinches(blob, policy)
        assert out.shape == blob.shape and out.dtype == blob.dtype
        assert np.array_equal(out, blob)  # nothing to decide -> nothing changed
