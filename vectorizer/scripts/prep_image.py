"""CLI wrapper around app.core.conditioning — condition a render to two-tone PNG.

The conditioning logic lives in app/core/conditioning.py so it ships in the
Docker image and is wired into the HTTP endpoint. This is just the CLI front.

    python -m scripts.prep_image render.png --height 15 --out conditioned.png
"""

from __future__ import annotations

import argparse

import numpy as np
from PIL import Image

from app.core.conditioning import condition_rgb


def prep(path: str, height_mm: float, key: str = "coverage", min_frac: float = 0.0004,
         target_px: int = 3600, blur: float = 3.0) -> tuple[Image.Image, float]:
    rgb = np.asarray(Image.open(path).convert("RGB"))
    binary, width_mm = condition_rgb(rgb, height_mm, key, min_frac, target_px, blur)
    return Image.fromarray(binary, "L").convert("RGBA"), width_mm


def main() -> None:
    ap = argparse.ArgumentParser(description="Condition a design render into a smooth two-tone PNG")
    ap.add_argument("image")
    ap.add_argument("--height", type=float, required=True, help="bracelet width in mm (image short axis)")
    ap.add_argument("--key", choices=["coverage", "warm", "dark", "saturation"], default="coverage")
    ap.add_argument("--min-frac", type=float, default=0.0004, help="speckle/hole area threshold (fraction of image)")
    ap.add_argument("--target-px", type=int, default=3600)
    ap.add_argument("--blur", type=float, default=3.0)
    ap.add_argument("--out", default="conditioned.png")
    args = ap.parse_args()

    im, width_mm = prep(args.image, args.height, args.key, args.min_frac, args.target_px, args.blur)
    im.save(args.out)
    print(f"wrote {args.out} {im.size}; width_mm={width_mm} height_mm={args.height}")


if __name__ == "__main__":
    main()
