"""Split a multi-row render into one candidate image per row.

The image model does not draw the aspect ratio it is asked for; what moves it is
the shape of the canvas, so forme asks for a render divided into N rows and each
row comes back narrow. Each row is also a separate variation — a candidate for
the customer — so the render has to be cut back into rows before tracing.

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


def split_rows(data: bytes) -> list[bytes]:
    """Cut a render into one PNG per band.

    Leaves white margin around each band: the vectorizer derives the strip frame
    from the bounding box of the metal, not from the size of the file. A render
    with a single band is returned untouched, bytes and all.
    """
    with Image.open(io.BytesIO(data)) as img:
        rgba = np.array(img.convert("RGBA"))

    bands = find_bands(rgba)
    if len(bands) <= 1:
        return [data]

    height = rgba.shape[0]
    out: list[bytes] = []
    for y0, y1 in bands:
        pad = max(4, _round((y1 - y0) * 0.15))
        top = max(0, min(height, y0 - pad))
        bottom = max(top, min(height, y1 + pad))
        buf = io.BytesIO()
        Image.fromarray(rgba[top:bottom]).save(buf, format="PNG")
        out.append(buf.getvalue())
    return out
