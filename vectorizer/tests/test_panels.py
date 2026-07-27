"""Row-splitting tests — ported alongside the code from the Worker's vitest suite."""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from app.core.panels import find_bands, split_rows


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
