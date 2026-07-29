"""Condition a raw design render into a clean, smooth two-tone PNG.

Real renders are shaded/coloured with the metal in a distinct hue against a
lighter background+cutouts. The default path measures, per pixel, how much of
it is covered by metal (``coverage``): the background colour is read off the
image border, the metal colour off the pixels furthest from it, and every pixel
is projected onto the background->metal axis. For an anti-aliased edge that
projection *is* the pixel's metal coverage, so 0.5 is the true geometric
boundary — and shading, ambient occlusion inside narrow openings and the cast
shadow only darken *toward* the background axis, so they land well below 0.5
instead of being rounded up into metal.

The legacy single-channel colour keys are still available for odd renders the
coverage estimate can't read. Both paths crop to the largest metal part (so a
cast shadow doesn't inflate the bounding box and with it the derived width),
despeckle, and emit a black-metal-on-white PNG the tracer can consume, plus the
crop's width in mm.

This lives under app/ (not scripts/) so it ships in the Docker image and can be
wired into the HTTP endpoint; scripts/prep_image.py re-exports it for CLI use.
"""

from __future__ import annotations

import io

import cv2
import numpy as np
from PIL import Image

#: Colour keys accepted by ``condition_rgb``/``condition_png``.
COVERAGE_KEY = "coverage"
LEGACY_KEYS = ("warm", "dark", "saturation")


def metal_score(rgb: np.ndarray, key: str) -> np.ndarray:
    """Continuous 'how much this pixel looks like metal' field (0..255)."""
    r = rgb[:, :, 0].astype(np.int32)
    b = rgb[:, :, 2].astype(np.int32)
    if key == "warm":  # brass/gold metal vs neutral background
        return (r - b).clip(0, 255).astype(np.uint8)
    if key == "dark":  # dark metal vs light background
        return (255 - cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)).astype(np.uint8)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)[:, :, 1]  # saturation


def background_colour(rgb: np.ndarray, frac: float = 0.04) -> np.ndarray:
    """Median colour of a border band — the part never reaches the frame edge."""
    h, w = rgb.shape[:2]
    b = max(2, int(min(h, w) * frac))
    f = rgb.astype(np.float32)
    edge = np.concatenate(
        [f[:b].reshape(-1, 3), f[-b:].reshape(-1, 3), f[:, :b].reshape(-1, 3), f[:, -b:].reshape(-1, 3)]
    )
    return np.median(edge, axis=0)


def coverage(rgb: np.ndarray) -> np.ndarray:
    """Per-pixel metal coverage in 0..1 (0 = pure background, 1 = pure metal).

    Projecting onto the background->metal axis is what makes this robust: a
    shadow or an ambient-occlusion gradient is the *background* colour scaled
    down, so it projects only partway and stays under 0.5, while an
    anti-aliased metal edge projects to its true coverage fraction. It is also
    polarity-safe by construction — background is 0 whatever the metal's hue.
    """
    f = rgb.astype(np.float32)
    bg = background_colour(f)
    dist = np.linalg.norm(f - bg, axis=2)
    far = f[dist >= np.percentile(dist, 97)].reshape(-1, 3)
    metal = np.median(far, axis=0)
    axis = metal - bg
    denom = float(axis @ axis)
    if denom < 1.0:  # background and metal are the same colour — nothing to key on
        raise ValueError("no metal detected — the render has no colour separation")
    return np.clip(((f - bg) @ axis) / denom, 0.0, 1.0)


def _separation(score: np.ndarray) -> tuple[float, float, bool]:
    """(class separation, foreground ratio, inverted?) for an Otsu split.

    ``inverted`` is True when the *border* — which is background by definition —
    lands in the foreground class, i.e. the key has the metal and the background
    the wrong way round. Without this check a key that separates the two classes
    beautifully but backwards scores just as well as the correct one.
    """
    t, _ = cv2.threshold(score, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    fg = score > t
    ratio = float(fg.mean())
    if ratio <= 0.02 or ratio >= 0.98:
        return 0.0, ratio, False
    b = max(2, int(min(fg.shape) * 0.04))
    border = np.concatenate([fg[:b].ravel(), fg[-b:].ravel(), fg[:, :b].ravel(), fg[:, -b:].ravel()])
    sep = (float(score[fg].mean()) - float(score[~fg].mean())) / (float(score.std()) + 1e-6)
    return sep, ratio, bool(border.mean() > 0.5)


def choose_key(rgb: np.ndarray) -> str:
    """Auto-pick the legacy colour key that best separates metal from background."""
    best, best_sep = "dark", -1.0
    for key in LEGACY_KEYS:
        sep, ratio, inverted = _separation(metal_score(rgb, key))
        if inverted:
            continue  # scores the background as metal — would invert the mask
        if 0.05 < ratio < 0.95 and sep > best_sep:
            best, best_sep = key, sep
    return best


def despeckle(mask: np.ndarray, min_frac: float, report: dict | None = None) -> np.ndarray:
    """Remove small metal specks and fill small pinholes — keeps real cutouts.

    Deliberately NO morphological open/close: those fatten/merge the thin metal
    bands and destroy fidelity. Speckle/hole removal is area-based only.

    Whatever it drops is real design that will not reach the cutting file, so
    the counts go into ``report`` for the back-office rather than vanishing.
    """
    m = mask.copy()
    min_area = max(16, int(m.size * min_frac))
    keep_big = 0.4 * m.size  # never swallow the background component itself
    removed = {"specks": 0, "holes": 0}
    for fill, invert, name in ((0, False, "specks"), (255, True, "holes")):
        src = (m == 0).astype(np.uint8) if invert else (m > 0).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(src, 8)
        for i in range(1, n):
            area = st[i, cv2.CC_STAT_AREA]
            if area < min_area and area < keep_big:
                m[lab == i] = fill
                removed[name] += 1
    if report is not None:
        report["despeckled"] = removed
        report["min_feature_px"] = min_area
    return m


def _crop_to_part(metal: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box of the largest metal blob.

    Cropping to *every* pixel above the threshold pulls the cast shadow into the
    box, which stretches the crop's height and — since width_mm is derived from
    the aspect ratio — mis-scales the whole part.
    """
    n, _, st, _ = cv2.connectedComponentsWithStats(metal.astype(np.uint8), 8)
    if n <= 1:
        raise ValueError("no metal detected — try a different colour key")
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = st[i, :4]
    return y, y + h, x, x + w


def condition_rgb(
    rgb: np.ndarray,
    height_mm: float,
    key: str = COVERAGE_KEY,
    min_frac: float = 0.0004,
    target_px: int = 3600,
    blur: float = 3.0,
    report: dict | None = None,
) -> tuple[np.ndarray, float]:
    """Return a smooth black-metal-on-white mask image and the crop width in mm."""
    if key in LEGACY_KEYS:
        # Legacy path: Otsu on the single channel, remapped piecewise-linearly
        # so its threshold lands on 0.5 and both paths share one cut. The map is
        # monotone, so this is the old decision boundary, not a new one.
        raw = metal_score(rgb, key)
        t0, _ = cv2.threshold(raw, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
        score = raw.astype(np.float32)
        field = np.where(
            score <= t0,
            0.5 * score / max(t0, 1.0),
            0.5 + 0.5 * (score - t0) / max(255.0 - t0, 1.0),
        ).astype(np.float32)
    else:
        field = coverage(rgb)

    y0, y1, x0, x1 = _crop_to_part(field > 0.5)
    field = field[y0:y1, x0:x1]

    h, w = field.shape
    width_mm = round(height_mm * w / h, 2)

    scale = target_px / w
    up = cv2.resize(field, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_CUBIC)
    if blur > 0:
        up = cv2.GaussianBlur(up, (0, 0), blur)
    mask = np.where(up > 0.5, 255, 0).astype(np.uint8)
    mask = despeckle(mask, min_frac, report)

    if report is not None:
        report["key"] = key
        report["width_mm"] = width_mm

    binary = np.where(mask > 0, 0, 255).astype(np.uint8)  # black = metal
    return binary, width_mm


def condition_png(
    data: bytes,
    height_mm: float,
    key: str = COVERAGE_KEY,
    min_frac: float = 0.0004,
    target_px: int = 3600,
    blur: float = 3.0,
) -> tuple[bytes, float, str, dict]:
    """Condition raw image bytes → (two-tone PNG, width_mm, key used, report)."""
    rgb = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"))
    if key == "auto":
        key = COVERAGE_KEY
    report: dict = {}
    binary, width_mm = condition_rgb(rgb, height_mm, key, min_frac, target_px, blur, report)
    buf = io.BytesIO()
    Image.fromarray(binary, "L").convert("RGBA").save(buf, format="PNG")
    return buf.getvalue(), width_mm, key, report
