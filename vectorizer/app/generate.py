"""One customer generation, end to end, on the box.

forme decides (how many rows, how many calls, what the prompt says, which
candidate is manufacturable); this module executes: render -> split into rows ->
trace each row -> upload the artefacts -> hand back the cutouts.

Why it moved off the Worker: a 53x10 ring plans to four renders, and four
1536x1024 PNGs decoded, cropped and re-encoded in JS — plus four debug payloads
buffered whole — exceeds what a Cloudflare isolate may spend (128MB / a hard CPU
ceiling), so the run was killed after the pipeline had already succeeded. None of
that work is edge work. Here it is a VM doing VM things.

What deliberately did NOT move: the fabrication rules. The prompt arrives built,
and the manufacturability verdict is forme's to make on the cutouts we return —
one geometry engine, in TypeScript, with no second copy to drift from.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Optional

import anyio

from . import imagegen, pipeline, uploads
from .core.panels import split_rows

STAGE_NAMES = ("conditioned", "overlay", "difference", "rendered")


@dataclass
class GenerateJob:
    """What forme asks for. Every decision in here was made on the Worker."""

    prompt: str
    calls: int = 1
    rows: int = 1
    height_mm: float = 15.0
    color_key: str = "dark"
    inspiration: Optional[tuple[bytes, str]] = None


@dataclass
class Artifacts:
    """Signed upload URLs, one per artefact forme wants persisted."""

    renders: list[str] = field(default_factory=list)
    stages: dict[str, str] = field(default_factory=dict)


def _stage_images(res: pipeline.PipelineResult) -> dict[str, bytes]:
    """The four back-office stage pictures, as bytes — never base64."""
    out: dict[str, bytes] = {}
    if res.conditioned_png is not None:
        out["conditioned"] = res.conditioned_png
    if res.rendered_mask is not None:
        out["rendered"] = pipeline.mask_png(res.rendered_mask)
        out["overlay"] = pipeline.overlay_image(res.image, res.rendered_mask)
        out["difference"] = pipeline.difference_image(res.source_mask, res.rendered_mask)
    return out


def _trace(panel: bytes, height_mm: float, color_key: str) -> pipeline.PipelineResult:
    return pipeline.run_pipeline(
        panel,
        0.0,
        height_mm,
        dark_region_role="metal",
        output_mode="both",
        condition=True,
        color_key=color_key,
    )


async def run(job: GenerateJob, artifacts: Artifacts, openai_key: str, concurrency: int = 4) -> dict:
    renders = await imagegen.render_many(openai_key, job.prompt, job.calls, job.inspiration)

    # One panel per row of every render. A single-row render passes through
    # untouched, so the common case costs nothing.
    panels: list[bytes] = []
    for data in renders:
        panels.extend(split_rows(data))

    # The trace is CPU-bound; run it off the event loop, a few at a time, so the
    # box stays responsive and its memory stays bounded no matter what forme asks
    # for.
    limit = asyncio.Semaphore(max(1, concurrency))

    async def trace(panel: bytes):
        async with limit:
            try:
                return await anyio.to_thread.run_sync(_trace, panel, job.height_mm, job.color_key)
            except Exception:  # a panel the pipeline cannot read is not a failed run
                return None

    results = await asyncio.gather(*(trace(p) for p in panels))

    candidates = []
    for i, res in enumerate(results):
        if res is None:
            continue
        sel = res.selection.selected
        candidates.append(
            {
                "panel": i,
                "status": res.status,
                "cutouts_svg": sel.cutouts_svg if sel is not None else None,
                "width_mm": res.width_mm,
                "metrics": sel.metrics.to_dict() if sel is not None else None,
            }
        )

    # The run forme logs: the first approved panel, or the first one traced at all
    # — the same choice the Worker used to make, kept so the back office keeps
    # reading the same shape.
    chosen = next(
        (i for i, r in enumerate(results) if r is not None and r.status == "approved" and r.selection.selected),
        next((i for i, r in enumerate(results) if r is not None), None),
    )
    selected = results[chosen] if chosen is not None else None

    # Upload under a label, and report back which labels landed: forme records a
    # path in the run log only for an artefact that is actually there, so the back
    # office never shows a broken picture.
    labelled: list[tuple[str, str, bytes]] = [
        (f"render:{i}", url, data) for i, (url, data) in enumerate(zip(artifacts.renders, renders))
    ]
    if selected is not None:
        images = _stage_images(selected)
        labelled += [
            (f"stage:{name}", url, images[name]) for name, url in artifacts.stages.items() if name in images
        ]
    landed = set(await uploads.put_all([(url, data) for _, url, data in labelled]))
    uploaded = [label for label, url, _ in labelled if url in landed]

    payload: dict = {
        "model": imagegen.MODEL,
        "rows": job.rows,
        "calls": job.calls,
        "panels": len(panels),
        "renders": len(renders),
        "selected_panel": chosen,
        "candidates": candidates,
        "uploaded_renders": [int(l.split(":")[1]) for l in uploaded if l.startswith("render:")],
        "uploaded_stages": [l.split(":")[1] for l in uploaded if l.startswith("stage:")],
    }
    if selected is not None:
        debug = pipeline.build_debug(selected)
        debug.pop("images", None)  # the pictures went to storage, not down the wire
        sel = selected.selection.selected
        payload.update(pipeline.to_result_dict(selected))
        payload["debug"] = debug
        if sel is not None:
            payload["cutouts_svg"] = sel.cutouts_svg
    else:
        payload["status"] = "rejected"
    return payload
