"""Transparency reaches conditioning flattened onto white — never as raw RGB.

The image model ships transparent-background PNGs at its own discretion
(``background`` defaults to auto), and under alpha=0 the encoder leaves junk
RGB — measured on AP-0170 (14.8): a gray gradient carrying a blurred copy of
the piece. PIL's ``convert("RGB")`` drops the alpha channel instead of
compositing, so conditioning used to read that junk as the background while
every browser showed a clean piece on white. These tests pin the contract:
what conditioning reads is what a viewer shows.
"""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from app.core.conditioning import condition_png

W, H = 1200, 300


def _piece_alpha() -> np.ndarray:
    """An opaque lens-shaped piece with one opening, soft anti-aliased edge."""
    sil = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(sil)
    cx, cy = W / 2, H / 2
    top, bot = [], []
    for x in range(100, W - 100):
        u = (x - cx) / ((W - 200) / 2)
        half = 105 * max(0.25, 1 - u * u) ** 0.5
        top.append((x, cy - half))
        bot.append((x, cy + half))
    d.polygon(top + bot[::-1], fill=255)
    d.ellipse([cx - 220, cy - 48, cx + 220, cy + 48], fill=0)
    return np.array(sil.filter(ImageFilter.GaussianBlur(2)), np.float32) / 255


def _png(rgba: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG")
    return buf.getvalue()


def _transparent_with_junk(junk_value: float | None = None) -> bytes:
    """The render as shipped: black piece, alpha=0 background, junk RGB under it.

    ``junk_value=None`` builds AP-0170's junk — a gradient carrying a blurred
    copy of the piece; a number paints that flat value under the transparency.
    """
    alpha = _piece_alpha()
    if junk_value is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
        junk = 150 - 80 * np.clip(r - 0.15, 0, 1) ** 1.2
        glow = (
            np.array(
                Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18)),
                np.float32,
            )
            / 255
        )
        junk = junk * (1 - 0.85 * glow)
    else:
        junk = np.full((H, W), junk_value, np.float32)
    rgb = np.dstack([junk] * 3)
    rgb[alpha > 0.5] = 8.0
    return _png(np.dstack([rgb, alpha[..., None] * 255]).astype(np.uint8))


def _flattened_white() -> bytes:
    """The same render composited onto white — what every viewer displays.

    The composite uses the exact arithmetic the pipeline standardises on
    (``load_and_validate`` and now ``condition_png``), so the equality below is
    about *which pixels are read*, not about rounding-mode trivia."""
    rgba = np.asarray(Image.open(io.BytesIO(_transparent_with_junk())).convert("RGBA"), np.uint8)
    a = rgba[:, :, 3:4].astype(np.float32) / 255.0
    rgb = (rgba[:, :, :3].astype(np.float32) * a + 255.0 * (1.0 - a)).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb, "RGB").save(buf, format="PNG")
    return buf.getvalue()


def _mask(png: bytes) -> np.ndarray:
    return np.asarray(Image.open(io.BytesIO(png)).convert("L"))


def test_junk_under_transparency_reads_the_same_as_the_flattened_render():
    got_png, got_w, _, _ = condition_png(_transparent_with_junk(), 18.0)
    ref_png, ref_w, _, _ = condition_png(_flattened_white(), 18.0)
    assert got_w == ref_w
    assert np.array_equal(_mask(got_png), _mask(ref_png))


def test_black_junk_under_transparency_does_not_erase_the_colour_separation():
    # Solid black under alpha=0 makes the raw RGB one flat colour — the exact
    # input that used to raise "no metal detected". The alpha says otherwise.
    png, width_mm, _, _ = condition_png(_transparent_with_junk(junk_value=0.0), 18.0)
    m = _mask(png)
    assert (m < 128).any() and (m > 128).any()
    assert width_mm == pytest.approx(condition_png(_flattened_white(), 18.0)[1])


def test_an_opaque_image_is_untouched_by_the_flatten():
    alpha = _piece_alpha()
    rgb = np.full((H, W, 3), 250, np.float32)
    rgb[alpha > 0.5] = 8.0
    opaque = _png(np.dstack([rgb, np.full((H, W, 1), 255, np.float32)]).astype(np.uint8))
    png, width_mm, _, _ = condition_png(opaque, 18.0)
    m = _mask(png)
    assert (m < 128).any() and (m > 128).any()
    assert width_mm > 0
