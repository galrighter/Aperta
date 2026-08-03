"""Split a multi-piece render into one candidate image per piece.

The image model does not draw the aspect ratio it is asked for; what moves it is
the shape of the canvas, so forme asks for a render divided into N rows and each
row comes back narrow. Each piece is also a separate variation — a candidate for
the customer — so the render has to be cut back into pieces before tracing.

A short piece (a ring) has room for more than one column, and asking for a grid
rather than a stack keeps the shape of the cell — and so the drawn aspect ratio
— while multiplying the alternatives. So the cut is a grid: bands down the
image, then columns across each band.

This used to run in the Cloudflare Worker on a hand-rolled PNG codec (sharp does
not run there). It lives here now: the box has Pillow, and the bytes never leave
the process on their way into the pipeline. The thresholds below are ported
verbatim from that implementation so the cut is unchanged.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image


def _round(x: float) -> int:
    """Round half up, matching the JS implementation this was ported from."""
    return int(np.floor(x + 0.5))


def _dark(rgba: np.ndarray, threshold: int) -> np.ndarray:
    """Metal pixels: dark and opaque. One definition for every raster question
    asked of a render — bands, columns and edges all mean the same thing by
    "metal", or they disagree about the same picture."""
    rgb = rgba[:, :, :3].astype(np.int32)
    # Approximate luma, same weights as the original.
    luma = (rgb[:, :, 0] * 299 + rgb[:, :, 1] * 587 + rgb[:, :, 2] * 114) / 1000
    return (luma < threshold) & (rgba[:, :, 3] > 128)


def find_bands(
    rgba: np.ndarray,
    threshold: int = 128,
    min_coverage: float = 0.005,
) -> list[tuple[int, int]]:
    """Rows of metal in the render: runs of pixel rows that contain dark.

    Returns half-open ``(y0, y1)`` pairs. The soft shadow the model adds under a
    strip is lighter than the threshold and so is not counted as its own band.
    """
    height, width = rgba.shape[0], rgba.shape[1]
    min_pixels = max(2, _round(width * min_coverage))

    dark = _dark(rgba, threshold).sum(axis=1) >= min_pixels

    bands: list[list[int]] = []
    start: int | None = None
    for y in range(height):
        if dark[y] and start is None:
            start = y
        if not dark[y] and start is not None:
            bands.append([start, y])
            start = None
    if start is not None:
        bands.append([start, height])

    # Bands separated by a hairline gap are one band the shadow or the smoothing
    # cut in two.
    merged: list[list[int]] = []
    min_gap = max(4, _round(height * 0.01))
    for b in bands:
        if merged and b[0] - merged[-1][1] < min_gap:
            merged[-1][1] = b[1]
        else:
            merged.append(list(b))

    min_height = max(4, _round(height * 0.015))
    return [(y0, y1) for y0, y1 in merged if y1 - y0 >= min_height]


def clipped_edges(
    data: bytes,
    threshold: int = 128,
    margin: int = 2,
    min_run: float = 0.01,
) -> list[str]:
    """Which canvas edges the metal touches — a clipped piece, not a framed one.

    The prompt asks for plain white around every piece, so metal within
    ``margin`` pixels of the border means the model drew past the canvas and the
    picture holds only part of the piece. Nothing downstream can tell: the crop
    trims to content, the trace is faithful to the clipped picture, every gate
    compares the two — so the check has to happen here, on the whole render,
    before any of that. Measured on RM-0076: the strip ran off the left border
    (~150 metal pixels on the edge), the derived length came back 147.95mm
    against the 160.4 ordered, and the customer saw a design cut mid-motif.

    The bar is a run of metal, not a pixel: anti-aliasing specks stay below
    ``min_run`` of the edge length, a strip end that continues off-canvas
    crosses it by an order of magnitude.
    """
    with Image.open(io.BytesIO(data)) as img:
        rgba = np.array(img.convert("RGBA"))
    dark = _dark(rgba, threshold)
    height, width = dark.shape

    out: list[str] = []
    # (name, border strip, axis whose runs we count) — for left/right a run is
    # rows of metal along the edge, for top/bottom it is columns.
    for name, band, along in (
        ("left", dark[:, :margin], 1),
        ("right", dark[:, width - margin :], 1),
        ("top", dark[:margin, :], 0),
        ("bottom", dark[height - margin :, :], 0),
    ):
        edge_len = height if along == 1 else width
        if band.any(axis=along).sum() >= max(2, _round(edge_len * min_run)):
            out.append(name)
    return out


def _encode(cell: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(cell).save(buf, format="PNG")
    return buf.getvalue()


def split_columns(band: np.ndarray, cols: int) -> list[np.ndarray]:
    """Cut one band into its ``cols`` pieces, or leave it whole.

    A short piece — a ring — leaves room across the image for more than one
    column, which is how forme buys alternatives without changing the shape of
    the cell (see src/lib/render/panels.ts). Finding the columns is the same
    run-finding as ``find_bands``, transposed.

    It only cuts when it finds exactly the ``cols`` groups that were asked for.
    A cut-out pattern can leave white all the way through a piece, and splitting
    on that would hand the tracer half a bracelet as if it were a whole one;
    refusing to cut costs one alternative, which is the cheaper mistake.
    """
    if cols <= 1:
        return [band]
    groups = find_bands(np.transpose(band, (1, 0, 2)))
    if len(groups) != cols:
        return [band]
    width = band.shape[1]
    out: list[np.ndarray] = []
    for x0, x1 in groups:
        pad = max(4, _round((x1 - x0) * 0.05))
        left = max(0, min(width, x0 - pad))
        right = max(left, min(width, x1 + pad))
        out.append(band[:, left:right])
    return out


def split_panels(data: bytes, cols: int = 1) -> list[bytes]:
    """Cut a render into one PNG per piece: bands down, then columns across.

    Leaves white margin around each piece: the vectorizer derives the strip
    frame from the bounding box of the metal, not from the size of the file. A
    render holding a single piece is returned untouched, bytes and all.
    """
    with Image.open(io.BytesIO(data)) as img:
        rgba = np.array(img.convert("RGBA"))

    bands = find_bands(rgba)
    if len(bands) <= 1 and cols <= 1:
        return [data]

    height = rgba.shape[0]
    out: list[bytes] = []
    for y0, y1 in bands:
        pad = max(4, _round((y1 - y0) * 0.15))
        top = max(0, min(height, y0 - pad))
        bottom = max(top, min(height, y1 + pad))
        out.extend(_encode(cell) for cell in split_columns(rgba[top:bottom], cols))
    if not out:
        return [data]
    return out


def split_rows(data: bytes) -> list[bytes]:
    """Backwards-compatible name: a single column of bands."""
    return split_panels(data, 1)
