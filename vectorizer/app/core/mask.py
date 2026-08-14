"""Stages B–D — colour analysis, binary mask generation, conservative cleanup."""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .validation import InputError, ValidatedImage

#: How a zero-width diagonal touch is resolved. See resolve_diagonal_pinches.
TURN_POLICIES = ("minority", "majority", "metal", "cutout", "none")

#: Local metal share below which metal counts as the scarce colour. Deliberately
#: under a half: two solid areas colliding at a point fill the window with
#: *exactly* half metal, so testing against 0.5 would decide that case on
#: floating-point rounding. Anything near half is two slabs meeting, not a thin
#: feature, and the openings take the point.
_METAL_SCARCE_BELOW = 0.45


@dataclass
class MaskResult:
    clean_mask: np.ndarray  # (H, W) uint8 in {0,255}; 255 == metal
    raw_mask: np.ndarray
    otsu_threshold: int
    foreground_ratio: float
    cleanup_changed_ratio: float
    pinch_report: dict = field(default_factory=dict)


def _grayscale(rgba: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2GRAY)


def otsu_threshold(gray: np.ndarray) -> int:
    t, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    t = int(t)
    # A perfectly bimodal {0,255} image gives Otsu a degenerate optimum and
    # OpenCV can return 0/255; fall back to the midpoint of the value range.
    if not 0 < t < 255:
        lo, hi = int(gray.min()), int(gray.max())
        t = max(1, min(254, (lo + hi) // 2))
    return t


def build_mask(
    image: ValidatedImage,
    dark_region_role: str,
    threshold: int,
) -> np.ndarray:
    """Binary mask where 255 marks *metal*, honouring dark_region_role.

    ``dark_region_role == "metal"`` → dark pixels become metal.
    ``dark_region_role == "background"`` → light pixels become metal.
    """
    gray = _grayscale(image.rgba)
    dark = gray < threshold  # True where pixel is dark
    metal = dark if dark_region_role == "metal" else ~dark
    return np.where(metal, 255, 0).astype(np.uint8)


def clean_mask(mask: np.ndarray) -> tuple[np.ndarray, float]:
    """Conservative denoise: drop tiny specks, fill pinholes, light open/close.

    Returns the cleaned mask and the fraction of pixels that changed vs input.
    """
    h, w = mask.shape
    total = h * w
    k = max(1, round(min(w, h) * 0.0005))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1))

    min_area = max(4, round(total * 1e-6))

    out = mask.copy()
    # remove small foreground specks
    n, labels, stats, _ = cv2.connectedComponentsWithStats((out > 0).astype(np.uint8), 8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            out[labels == i] = 0
    # fill small background holes (specks in the metal)
    inv = (out == 0).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(inv, 8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            out[labels == i] = 255
    out = cv2.morphologyEx(out, cv2.MORPH_OPEN, kernel)
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, kernel)

    changed = float(np.count_nonzero(out != mask)) / total
    return out, changed


def _local_metal_fraction(metal: np.ndarray) -> np.ndarray:
    """Metal coverage around each pixel, over a window wide enough to be told
    apart from the touch itself.

    The window has to see past the pinch. Any diagonal touch is ~50% metal in
    its immediate 5x5 neighbourhood *by construction* — two metal cells, two
    background cells and whatever the four corners bring — so a small window
    answers "about half" for a hairline strand and for two colliding slabs
    alike, and the policy degenerates into a coin toss on rounding.
    """
    h, w = metal.shape
    k = int(np.clip(round(min(h, w) * 0.05), 9, 51)) | 1  # odd, resolution-relative
    return cv2.blur(metal.astype(np.float32), (k, k))


def resolve_diagonal_pinches(mask: np.ndarray, policy: str) -> tuple[np.ndarray, dict]:
    """Decide, explicitly, what a zero-width diagonal touch means.

    A 2x2 window holding metal on one diagonal and background on the other is a
    point where *both* regions are pinched to nothing: two metal areas meet at a
    single mathematical point, and so do the two openings around them. OpenCV
    traces the foreground 8-connected, so it silently rules that the metal is
    joined there — a bridge of exactly zero width is carried into the SVG as
    sound geometry, the component count says one piece, and the minimum-bridge
    check downstream is handed a part that reads as connected. The laser cuts
    through the point and the piece arrives in two.

    potrace makes this an explicit ``turnpolicy`` and so does this:

    * ``minority`` (default) — whichever colour is locally rarer wins the
      connection. Thin metal over open ground stays joined; a hairline slit
      through solid metal stays open. This preserves whichever feature is the
      fragile one, which is nearly always the design intent.
    * ``majority`` — the inverse.
    * ``metal`` / ``cutout`` — always join / always separate.
    * ``none`` — leave it to OpenCV, i.e. the old implicit behaviour.

    Joining widens the bridge to one honest pixel; separating deletes one of the
    two touching pixels. Either way the answer is now in the mask, so the
    fidelity metrics and forme's validation both see the same part.
    """
    m = mask > 0
    tl, tr = m[:-1, :-1], m[:-1, 1:]
    bl, br = m[1:, :-1], m[1:, 1:]
    main = tl & br & ~tr & ~bl  # metal on the ↘ diagonal
    anti = tr & bl & ~tl & ~br  # metal on the ↗ diagonal
    found = int(main.sum() + anti.sum())

    # Counting happens even under "none": the back-office should be able to see
    # that a run had zero-width touches nobody decided, not just that the check
    # was switched off.
    report = {"policy": policy, "found": found, "joined": 0, "separated": 0}
    if policy == "none" or found == 0:
        return mask, report

    if policy == "metal":
        join = np.ones_like(main)
    elif policy == "cutout":
        join = np.zeros_like(main)
    else:
        metal_scarce = _local_metal_fraction(m)[:-1, :-1] < _METAL_SCARCE_BELOW
        join = metal_scarce if policy == "minority" else ~metal_scarce

    out = mask.copy()
    # Views over `out`; the decisions were all computed from `m` above, so the
    # writes below cannot feed back into the classification.
    # Both decisions only ever rewrite the window's top row: filling one of the
    # two background cells is enough to join, clearing one of the two metal
    # cells is enough to separate.
    o_tl, o_tr = out[:-1, :-1], out[:-1, 1:]
    o_tr[main & join] = 255       # fill the gap -> a one-pixel-wide bridge
    o_tl[main & ~join] = 0        # drop one corner -> the two areas come apart
    o_tl[anti & join] = 255
    o_tr[anti & ~join] = 0

    joined = int((main & join).sum() + (anti & join).sum())
    report["joined"] = joined
    report["separated"] = found - joined
    return out, report


#: How much of a border the metal has to occupy before that border counts as
#: the stock edge. Half is a wide separator, not a tuned number: a strip drawn
#: edge to edge covers 100% of every border, while a drawn silhouette that
#: merely grazes one covers a few per cent (measured: 3–30% on a lobed cuff,
#: 14–18% on AP-0170's own top and bottom). Nothing real sits in between.
STOCK_EDGE_COVERAGE = 0.5


def border_coverage(mask: np.ndarray) -> dict[str, float]:
    """Share of each image border that is metal, in 0..1.

    The crop in ``conditioning`` is tight to the metal's bounding box, so
    *every* border is touched somewhere whatever the shape. What tells a stock
    edge from a graze is how much of the border the metal runs along.
    """
    m = mask > 0
    return {
        "top": float(m[0].mean()),
        "bottom": float(m[-1].mean()),
        "left": float(m[:, 0].mean()),
        "right": float(m[:, -1].mean()),
    }


def stock_edges(mask: np.ndarray, min_coverage: float = STOCK_EDGE_COVERAGE) -> tuple[str, ...]:
    """Which borders the piece really runs along — see ``geometry.snap_to_bounds``."""
    return tuple(k for k, v in border_coverage(mask).items() if v >= min_coverage)


def analyse_and_mask(
    image: ValidatedImage,
    dark_region_role: str,
    threshold_offset: int = 0,
    turn_policy: str = "minority",
) -> MaskResult:
    gray = _grayscale(image.rgba)
    base_t = otsu_threshold(gray)
    t = int(np.clip(base_t + threshold_offset, 0, 255))

    raw = build_mask(image, dark_region_role, t)
    fg_ratio = float(np.count_nonzero(raw)) / raw.size
    if fg_ratio < 0.001:
        raise InputError("NO_FOREGROUND_FOUND", f"foreground ratio {fg_ratio:.4f} too low")
    if fg_ratio > 0.999:
        raise InputError("FULL_FOREGROUND_IMAGE", f"foreground ratio {fg_ratio:.4f} too high")

    cleaned, changed = clean_mask(raw)
    # Last, so the morphological open/close cannot reintroduce a pinch after it
    # has been decided — and inside analyse_and_mask so the traced mask and the
    # mask the fidelity metrics score are the same one.
    cleaned, pinch_report = resolve_diagonal_pinches(cleaned, turn_policy)
    return MaskResult(
        clean_mask=cleaned,
        raw_mask=raw,
        otsu_threshold=base_t,
        foreground_ratio=fg_ratio,
        cleanup_changed_ratio=changed,
        pinch_report=pinch_report,
    )
