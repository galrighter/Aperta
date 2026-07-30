"""Local CLI for throwing real images at the pipeline without the HTTP layer.

    python -m app.cli input.png --width 160 --height 15 --out out/
"""

from __future__ import annotations

import argparse
import json
import os

from . import pipeline


def main() -> int:
    ap = argparse.ArgumentParser(description="Raster bracelet PNG -> faithful SVG")
    ap.add_argument("image")
    ap.add_argument("--width", type=float, default=0.0, help="width in mm (derived from crop when --condition)")
    ap.add_argument("--height", type=float, required=True, help="height in mm")
    ap.add_argument("--role", choices=["metal", "background"], default="metal")
    ap.add_argument("--condition", action="store_true", help="condition a raw metallic render into two-tone first")
    ap.add_argument("--key", choices=["coverage", "warm", "dark", "saturation", "auto"], default="coverage")
    ap.add_argument("--out", default="out")
    args = ap.parse_args()

    with open(args.image, "rb") as f:
        data = f.read()

    res = pipeline.run_pipeline(
        data, args.width, args.height, args.role, condition=args.condition, color_key=args.key
    )
    result = pipeline.to_result_dict(res)

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "result.json"), "w") as f:
        json.dump(result, f, indent=2)

    sel = res.selection.selected
    if sel is not None and res.rendered_mask is not None:
        with open(os.path.join(args.out, "metal.svg"), "w") as f:
            f.write(sel.metal_svg)
        with open(os.path.join(args.out, "cutouts.svg"), "w") as f:
            f.write(sel.cutouts_svg)
        with open(os.path.join(args.out, "rendered.png"), "wb") as f:
            f.write(pipeline.mask_png(res.rendered_mask))
        with open(os.path.join(args.out, "difference.png"), "wb") as f:
            f.write(pipeline.difference_image(res.source_mask, res.rendered_mask))
        with open(os.path.join(args.out, "overlay.png"), "wb") as f:
            f.write(pipeline.overlay_image(res.image, res.rendered_mask))

    print(json.dumps(result, indent=2))
    return 0 if res.status == "approved" else 2


if __name__ == "__main__":
    raise SystemExit(main())
