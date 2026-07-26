"""End-to-end orchestrator: PNG + dimensions -> cutouts SVG + fidelity report.

Deliberately lean: it does NOT duplicate forme's geometry engine, DXF export,
3D, kerf, or laser design-rules. Its one job is a faithful, *verified* trace.
forme consumes ``cutouts.svg`` through its existing normalize/validate/export.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from .config import SETTINGS, THRESHOLD_OFFSETS, TOLERANCE_MM
from .core import geometry, metrics, svg_builder, tracing
from .core.mask import analyse_and_mask
from .core.renderer import render_svg_to_mask
from .core.selection import Candidate, Selection, _topology_ok, select
from .core.validation import ValidatedImage, load_and_validate

_MEDIUM_TOLERANCE_MM = 0.05

# Every candidate carries its traced SVG in the debug bundle. Comparing them
# side by side is how a threshold/tolerance choice becomes visible, so the
# earlier cap only got in the way; the SVGs are small next to the render PNG.
SVG_DETAIL_COUNT = None


@dataclass
class PipelineResult:
    status: str
    selection: Selection
    candidates: list[Candidate]
    source_mask: np.ndarray
    rendered_mask: Optional[np.ndarray]
    image: ValidatedImage
    width_mm: float
    height_mm: float
    conditioned_png: Optional[bytes] = None
    chosen_key: Optional[str] = None


def _mm_per_px(image: ValidatedImage, width_mm: float, height_mm: float) -> float:
    return 0.5 * (width_mm / image.width_px + height_mm / image.height_px)


def _build_candidate(
    image: ValidatedImage,
    dark_region_role: str,
    width_mm: float,
    height_mm: float,
    threshold_offset: int,
    tolerance_mm: float,
) -> Optional[Candidate]:
    mm_per_px = _mm_per_px(image, width_mm, height_mm)
    tolerance_px = tolerance_mm / mm_per_px

    mask_res = analyse_and_mask(image, dark_region_role, threshold_offset)
    mask = mask_res.clean_mask

    geom_px = tracing.trace(mask, tolerance_px, SETTINGS.tracer_backend)
    geom_mm = geometry.scale_to_mm(geom_px, image.width_px, image.height_px, width_mm, height_mm)
    geom_mm = geometry.snap_to_bounds(geom_mm, width_mm, height_mm, tol=1.5 * mm_per_px)
    metal = geometry.cleanup(geom_mm)
    if SETTINGS.smooth_iters > 0:
        metal = geometry.snap_to_bounds(
            geometry.smooth_chaikin(metal, SETTINGS.smooth_iters), width_mm, height_mm, tol=1.5 * mm_per_px
        )
    if metal.is_empty:
        return None
    cutouts = geometry.cutouts_from_metal(metal, width_mm, height_mm)

    metal_svg = svg_builder.build_metal_svg(metal, width_mm, height_mm)
    cutouts_svg = svg_builder.build_cutouts_svg(cutouts, width_mm, height_mm)

    rendered = render_svg_to_mask(metal_svg, image.width_px, image.height_px)

    m = metrics.compute(
        source=mask,
        rendered=rendered,
        source_area_px=float(np.count_nonzero(mask)),
        vector_area_px=float(np.count_nonzero(rendered)),
        mm_per_px=mm_per_px,
    )
    stats = geometry.geometry_stats(metal)

    cand = Candidate(
        candidate_id=f"t{mask_res.otsu_threshold + threshold_offset}_e{tolerance_mm}",
        threshold=mask_res.otsu_threshold + threshold_offset,
        tolerance_mm=tolerance_mm,
        metrics=m,
        geometry_stats=stats,
        metal_svg=metal_svg,
        cutouts_svg=cutouts_svg,
    )
    cand._rendered = rendered  # type: ignore[attr-defined]  # kept for artifacts
    return cand


def run_pipeline(
    data: bytes,
    width_mm: float,
    height_mm: float,
    dark_region_role: str = "metal",
    output_mode: str = "both",
    condition: bool = False,
    color_key: str = "warm",
) -> PipelineResult:
    # Optional conditioning: turn a raw shaded/coloured render into a clean
    # smooth two-tone image first. width_mm is derived from the cropped metal,
    # and the conditioned image is black=metal, so the role becomes "metal".
    conditioned_png: Optional[bytes] = None
    chosen_key: Optional[str] = None
    if condition:
        from .core.conditioning import condition_png

        data, width_mm, chosen_key = condition_png(data, height_mm, color_key)
        dark_region_role = "metal"
        conditioned_png = data  # keep for the debug view

    image = load_and_validate(data, width_mm, height_mm)

    candidates: list[Candidate] = []
    # Phase 1: sweep thresholds at medium tolerance. Track offset alongside.
    phase1: list[tuple[int, Candidate]] = []
    for off in THRESHOLD_OFFSETS:
        c = _build_candidate(image, dark_region_role, width_mm, height_mm, off, _MEDIUM_TOLERANCE_MM)
        if c is not None:
            phase1.append((off, c))
            candidates.append(c)

    # Phase 2: best two thresholds x remaining tolerances.
    top_offsets = [off for off, _ in sorted(phase1, key=lambda p: p[1].metrics.iou, reverse=True)[:2]]
    for off in top_offsets:
        for tol in TOLERANCE_MM:
            if tol == _MEDIUM_TOLERANCE_MM:
                continue  # already built in phase 1
            if len(candidates) >= SETTINGS.max_candidates:
                break
            c = _build_candidate(image, dark_region_role, width_mm, height_mm, off, tol)
            if c is not None:
                candidates.append(c)

    selection = select(candidates)
    src_mask = analyse_and_mask(image, dark_region_role, 0).clean_mask
    # On rejection there is no selected candidate, but the back-office still
    # needs to see what the tracer produced — otherwise a failed run shows only
    # the conditioned mask and the reason stays invisible. Fall back to the
    # best-IoU candidate so overlay/difference/rendered are always available.
    shown = selection.selected
    if shown is None and candidates:
        shown = max(candidates, key=lambda c: c.metrics.iou)
    rendered = getattr(shown, "_rendered", None) if shown is not None else None

    return PipelineResult(
        status=selection.status,
        selection=selection,
        candidates=candidates,
        source_mask=src_mask,
        rendered_mask=rendered,
        image=image,
        width_mm=width_mm,
        height_mm=height_mm,
        conditioned_png=conditioned_png,
        chosen_key=chosen_key,
    )


def build_debug(res: PipelineResult) -> dict:
    """Full per-stage diagnostic bundle for the back-office view.

    Base64 images for each stage + every candidate's metrics + a staged
    pass/fail timeline so the first failing gate is obvious.
    """
    import base64

    from .config import SETTINGS

    def b64(data: bytes) -> str:
        return base64.b64encode(data).decode()

    images: dict[str, str] = {}
    if res.conditioned_png is not None:
        images["conditioned"] = b64(res.conditioned_png)
    if res.rendered_mask is not None:
        images["rendered"] = b64(mask_png(res.rendered_mask))
        images["overlay"] = b64(overlay_image(res.image, res.rendered_mask))
        images["difference"] = b64(difference_image(res.source_mask, res.rendered_mask))

    def cand_dict(c) -> dict:
        m = c.metrics
        s_topo, v_topo = m.source_topology, m.vector_topology
        return {
            "candidate_id": c.candidate_id,
            "threshold": c.threshold,
            "tolerance_mm": c.tolerance_mm,
            "iou": round(m.iou, 4),
            "mean_dev_mm": round(m.mean_contour_deviation_mm, 4),
            "max_dev_mm": round(m.max_contour_deviation_mm, 4),
            "source_holes": s_topo.holes,
            "vector_holes": v_topo.holes,
            "hole_budget": max(SETTINGS.hole_diff_abs, round(s_topo.holes * SETTINGS.hole_diff_frac)),
            # Connected components of metal. A cut pattern that severs the strip
            # into several pieces fails here — and in practice this, not the
            # hole count, is what rejects AI renders.
            "source_components": s_topo.components,
            "vector_components": v_topo.components,
            "component_budget": SETTINGS.component_diff_abs,
            # The gate that actually ran (tolerant, from selection), not the
            # strict exact-match metric — reporting the strict one made every
            # candidate look topology-broken even when it passed.
            "topology_ok": _topology_ok(c),
            "topology_exact": m.topology_ok,
            "anchors": c.geometry_stats.anchor_point_count,
            "score": round(c.score, 4),
            "rejected_reason": c.rejected_reason,
            "selected": c is res.selection.selected,
            **({"metal_svg": c.metal_svg, "cutouts_svg": c.cutouts_svg}
               if id(c) in svg_for else {}),
        }

    cands = sorted(res.candidates, key=lambda c: c.metrics.iou, reverse=True)
    sel = res.selection.selected

    # The traced SVG is the only artefact that shows *what actually came out*.
    # Numbers alone cannot explain a rejection — attach the geometry for the
    # candidates worth looking at (the best few, plus whichever was selected)
    # so a failed run can be inspected by eye instead of inferred from metrics.
    svg_for = {id(c) for c in (cands if SVG_DETAIL_COUNT is None else cands[:SVG_DETAIL_COUNT])}
    if sel is not None:
        svg_for.add(id(sel))

    # staged pass/fail timeline — first non-ok stage is the failure point.
    stages = []
    stages.append({"name": "conditioning", "status": "ok" if res.conditioned_png else "skip",
                   "detail": (f"colour-key={res.chosen_key} + crop + smooth" if res.conditioned_png else "input already two-tone")})
    stages.append({"name": "tracing", "status": "ok" if res.candidates else "fail",
                   "detail": f"{len(res.candidates)} candidates"})
    stages.append({"name": "smoothing", "status": "ok" if SETTINGS.smooth_iters > 0 else "skip",
                   "detail": f"Chaikin x{SETTINGS.smooth_iters}"})
    if sel is not None:
        m = sel.metrics
        stages.append({"name": "topology", "status": "ok" if _topology_ok(sel) else "fail",
                       "detail": (f"holes {m.source_topology.holes}->{m.vector_topology.holes}, "
                                  f"metal pieces {m.source_topology.components}->{m.vector_topology.components}")})
        stages.append({"name": "fidelity", "status": "ok" if res.status == "approved" else "warn",
                       "detail": f"IoU {m.iou:.3f}, mean {m.mean_contour_deviation_mm:.3f}mm, max {m.max_contour_deviation_mm:.3f}mm"})
    else:
        best = cands[0] if cands else None
        if best is not None:
            bm = best.metrics
            detail = (f"best IoU {bm.iou:.3f}, {best.rejected_reason} "
                      f"(holes {bm.source_topology.holes}->{bm.vector_topology.holes}, "
                      f"metal pieces {bm.source_topology.components}->{bm.vector_topology.components})")
        else:
            detail = "no candidate"
        stages.append({"name": "gate", "status": "fail", "detail": detail})

    return {
        "status": res.status,
        "width_mm": res.width_mm,
        "height_mm": res.height_mm,
        "color_key": res.chosen_key,
        "smooth_iters": SETTINGS.smooth_iters,
        "gates": {
            "min_iou_hard": SETTINGS.min_iou_hard,
            "target_iou": SETTINGS.target_iou,
            "max_mean_deviation_mm": SETTINGS.max_mean_deviation_mm,
            "max_max_deviation_mm": SETTINGS.max_max_deviation_mm,
            "hole_diff_abs": SETTINGS.hole_diff_abs,
            "hole_diff_frac": SETTINGS.hole_diff_frac,
            "component_diff_abs": SETTINGS.component_diff_abs,
        },
        "images": images,
        "candidates": [cand_dict(c) for c in cands],
        "stages": stages,
        "warnings": res.selection.warnings,
    }


def to_result_dict(res: PipelineResult) -> dict:
    """Serialise a pipeline run into the spec's result.json shape."""
    sel = res.selection.selected
    out: dict = {
        "status": res.status,
        "input": {
            "width_px": res.image.width_px,
            "height_px": res.image.height_px,
            "width_mm": res.width_mm,
            "height_mm": res.height_mm,
        },
        "candidate_count": len(res.candidates),
        "warnings": res.selection.warnings,
    }
    if sel is not None:
        out["selected_candidate"] = {
            "candidate_id": sel.candidate_id,
            "threshold": sel.threshold,
            "simplification_tolerance_mm": sel.tolerance_mm,
            "score": round(sel.score, 4),
        }
        out["metrics"] = sel.metrics.to_dict()
        out["geometry"] = {
            "path_count": sel.geometry_stats.path_count,
            "anchor_point_count": sel.geometry_stats.anchor_point_count,
            "self_intersections": sel.geometry_stats.self_intersections,
            "zero_area_rings": sel.geometry_stats.zero_area_rings,
            "open_paths": sel.geometry_stats.open_paths,
        }
    return out


# --- artifact rendering -----------------------------------------------------

def difference_image(source: np.ndarray, rendered: np.ndarray) -> bytes:
    from PIL import Image

    a = (source > 0)
    b = (rendered > 0)
    h, w = source.shape
    out = np.full((h, w, 3), 255, np.uint8)
    out[a & b] = (180, 180, 180)      # agreement — grey
    out[a & ~b] = (0, 160, 0)         # in source, missing in vector — green
    out[~a & b] = (220, 0, 0)         # added by vector — red
    buf = io.BytesIO()
    Image.fromarray(out).save(buf, format="PNG")
    return buf.getvalue()


def overlay_image(image: ValidatedImage, rendered: np.ndarray) -> bytes:
    from PIL import Image

    base = image.rgba[:, :, :3].astype(np.float32)
    edge = cv2.morphologyEx((rendered > 0).astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    overlay = base.copy()
    overlay[edge > 0] = (255, 0, 0)
    blended = (0.7 * base + 0.3 * overlay).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(blended).save(buf, format="PNG")
    return buf.getvalue()


def mask_png(mask: np.ndarray) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray(np.where(mask > 0, 0, 255).astype(np.uint8)).save(buf, format="PNG")
    return buf.getvalue()
