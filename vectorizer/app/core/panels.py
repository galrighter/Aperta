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

    rgb = rgba[:, :, :3].astype(np.int32)
    # Approximate luma, same weights as the original.
    luma = (rgb[:, :, 0] * 299 + rgb[:, :, 1] * 587 + rgb[:, :, 2] * 114) / 1000
    opaque = rgba[:, :, 3] > 128
    dark = ((luma < threshold) & opaque).sum(axis=1) >= min_pixels

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
