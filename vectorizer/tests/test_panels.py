"""Panel-splitting tests — ported alongside the code from the Worker's vitest suite."""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from app.core.panels import clipped_edges, find_bands, split_panels, split_rows


def striped(rows: int, shadow: bool = False) -> np.ndarray:
    """A white image with N dark strips — the row layout the model returns."""
    width, height = 300, 200
    rgba = np.full((height, width, 4), 255, dtype=np.uint8)
    slot = height // rows
    bar = int(slot * 0.5)
    for r in range(rows):
        y0 = r * slot + (slot - bar) // 2
        rgba[y0 : y0 + bar, 20 : width - 20, :3] = 17
        if shadow:
            # A soft shadow under the strip — lighter than the threshold, and it
            # must not be counted as another band.
            rgba[y0 + bar : min(height, y0 + bar + 4), 20 : width - 20, :3] = 205
    return rgba


def _png(rgba: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(rgba).save(buf, format="PNG")
    return buf.getvalue()


def test_finds_one_band_per_strip() -> None:
    for rows in (1, 2, 4, 6):
        assert len(find_bands(striped(rows))) == rows


def test_shadow_does_not_become_a_band() -> None:
    assert len(find_bands(striped(3, shadow=True))) == 3


def test_ignores_a_stray_speck() -> None:
    rgba = striped(2)
    rgba[5, 5, :3] = 0  # one dark pixel, far below the coverage floor
    assert len(find_bands(rgba)) == 2


def test_transparent_pixels_count_as_background() -> None:
    rgba = striped(2)
    rgba[2, :, :3] = 0
    rgba[2, :, 3] = 0
    assert len(find_bands(rgba)) == 2


def test_split_returns_one_png_per_band() -> None:
    panels = split_rows(_png(striped(4)))
    assert len(panels) == 4
    for p in panels:
        with Image.open(io.BytesIO(p)) as img:
            assert img.width == 300
            assert img.height < 200


def test_single_band_is_returned_untouched() -> None:
    data = _png(striped(1))
    assert split_rows(data) == [data]


def test_each_panel_keeps_its_own_strip() -> None:
    """A cut panel must contain exactly one band, with margin around it."""
    for p in split_rows(_png(striped(3))):
        with Image.open(io.BytesIO(p)) as img:
            assert len(find_bands(np.array(img.convert("RGBA")))) == 1


def gridded(rows: int, cols: int) -> np.ndarray:
    """A white image with rows x cols dark strips — the grid a short piece gets."""
    width, height = 300, 200
    rgba = np.full((height, width, 4), 255, dtype=np.uint8)
    slot_y, slot_x = height // rows, width // cols
    bar_y, bar_x = int(slot_y * 0.5), int(slot_x * 0.7)
    for r in range(rows):
        for c in range(cols):
            y0 = r * slot_y + (slot_y - bar_y) // 2
            x0 = c * slot_x + (slot_x - bar_x) // 2
            rgba[y0 : y0 + bar_y, x0 : x0 + bar_x, :3] = 17
    return rgba


def test_grid_yields_one_panel_per_piece() -> None:
    panels = split_panels(_png(gridded(2, 2)), cols=2)
    assert len(panels) == 4
    for p in panels:
        with Image.open(io.BytesIO(p)) as img:
            # Each panel holds one piece, and it is narrower than the full image.
            assert img.width < 300
            assert len(find_bands(np.array(img.convert("RGBA")))) == 1


def test_a_single_column_render_is_untouched_by_the_column_cut() -> None:
    assert len(split_panels(_png(striped(3)), cols=1)) == 3


def test_a_band_that_does_not_hold_the_asked_columns_is_left_whole() -> None:
    """Refusing to cut costs an alternative; cutting a piece in half costs the run."""
    panels = split_panels(_png(striped(2)), cols=2)
    assert len(panels) == 2
    for p in panels:
        with Image.open(io.BytesIO(p)) as img:
            assert img.width == 300


def test_split_rows_still_cuts_rows_only() -> None:
    assert len(split_rows(_png(gridded(3, 2)))) == 3


# --- clipped renders ---------------------------------------------------------
#
# A piece drawn with white margin all around never puts metal on the border; a
# piece the model drew past the canvas does, in a long run — that is the whole
# signal (RM-0076: the strip ran off the left border and reached the customer
# with an end cut mid-motif).


def test_a_framed_piece_touches_no_edge() -> None:
    assert clipped_edges(_png(striped(1))) == []
    assert clipped_edges(_png(gridded(2, 2))) == []


def test_a_strip_running_off_the_left_border_is_caught() -> None:
    rgba = striped(1)
    rgba[80:120, 0:150, :3] = 17  # the strip continues to (and past) x=0
    assert clipped_edges(_png(rgba)) == ["left"]


def test_each_edge_is_named_for_itself() -> None:
    rgba = striped(1)
    rgba[0:4, 100:200, :3] = 17  # metal on the top border
    rgba[80:120, 280:300, :3] = 17  # and running off the right
    assert clipped_edges(_png(rgba)) == ["right", "top"]


def test_an_edge_speck_is_not_a_clipped_piece() -> None:
    rgba = striped(1)
    rgba[100, 0, :3] = 0  # one dark pixel on the border — anti-aliasing, not metal
    assert clipped_edges(_png(rgba)) == []
