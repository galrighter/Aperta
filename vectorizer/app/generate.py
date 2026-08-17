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
import logging
from dataclasses import dataclass, field
from typing import Optional

import anyio

from . import imagegen, pipeline, uploads
from .core import renderer
from .core.panels import clipped_edges, split_panels

log = logging.getLogger(__name__)

STAGE_NAMES = ("conditioned", "overlay", "difference", "rendered")

#: Panels to keep per cell the grid actually asked for. Three is generous — a
#: render that splits into more than three times its own grid is noise, not
#: pieces — while leaving room for the padding bands a clean render produces.
PANELS_PER_RENDER_CAP = 3


@dataclass
class GenerateJob:
    """What forme asks for. Every decision in here was made on the Worker."""

    prompt: str
    calls: int = 1
    rows: int = 1
    # Columns in the render. The cut is a grid of rows x cols; 1 is a single
    # stack, which is what a long piece asks for.
    cols: int = 1
    height_mm: float = 15.0
    color_key: str = "dark"
    inspiration: Optional[tuple[bytes, str]] = None
    # An edit: the design as it stands, drawn the way a render looks. It is
    # rasterised here and handed to the image model as the reference, so the
    # change lands on the existing piece instead of producing a new one. It wins
    # over `inspiration` — this is the piece itself, not a mood board.
    base_svg: Optional[str] = None
    # forme's minimum opening, in mm. 0 keeps every traced opening.
    min_hole_mm: float = 0.0
    # Which image model to render with. None = the default. forme names it when
    # the run needs one in particular; the reason lives there, not here.
    model: Optional[str] = None
    # The canvas to draw on, "WIDTHxHEIGHT". None = landscape, which is what
    # every run was until forme started choosing. The shape is not cosmetic: it
    # sets the aspect ratio of each cell, and the model fills the cell it is
    # given. Unknown values fall back rather than fail (imagegen.resolve_size).
    size: Optional[str] = None
    # How hard the image model works on the picture. None = the default ("low").
    # forme names it when a run needs the detail; see imagegen.QUALITY for what
    # it costs and where it actually shows.
    quality: Optional[str] = None


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


def _trace(panel: bytes, height_mm: float, color_key: str, min_hole_mm: float) -> pipeline.PipelineResult:
    return pipeline.run_pipeline(
        panel,
        0.0,
        height_mm,
        dark_region_role="metal",
        output_mode="both",
        condition=True,
        color_key=color_key,
        min_hole_mm=min_hole_mm,
    )


def _reference(job: GenerateJob) -> Optional[tuple[bytes, str]]:
    """What the image model is given to work from, if anything.

    A base_svg that cannot be drawn is an error and not a quiet fall-through to
    text-only: silently generating from nothing is exactly the failure this path
    exists to fix, and it looks to the customer like a brand new piece.
    """
    if job.base_svg is None:
        return job.inspiration
    width, height = (int(n) for n in imagegen.resolve_size(job.size).split("x"))
    try:
        return (renderer.render_svg_to_png(job.base_svg, width, height), "image/png")
    except renderer.RenderError as exc:
        raise imagegen.ImageGenError(f"could not draw the current design: {exc}", retriable=False) from exc


async def run(job: GenerateJob, artifacts: Artifacts, openai_key: str, concurrency: int = 4) -> dict:
    model = imagegen.resolve_model(job.model)
    # Held so it can be stored: this is the picture the model was actually shown
    # — the lettering cut from the font, or the design being edited — and it is
    # rasterised here, so nothing upstream has the bytes. Rebuilding it from the
    # same inputs is not the same claim as keeping what was sent.
    reference = _reference(job)
    first = await imagegen.render_many(
        openai_key, job.prompt, job.calls, reference, model, size=job.size, quality=job.quality
    )
    renders = first.images
    # What the image model charged, across every call this run made — including
    # the retry below, whose renders are paid for whether or not they are kept.
    # It lands in forme's run log next to the model and the quality that set it,
    # so the cost of those two choices is readable per run instead of estimated
    # off a pricing page.
    usage = first.usage

    # A render whose metal touches the canvas edge holds only part of the piece:
    # the model drew past the border despite being asked for white all around,
    # and no later stage can tell — the crop trims to content and every gate
    # compares against the clipped picture (RM-0076 sailed through approved).
    # The remedy is one more render, quietly: same prompt, same model, one round
    # — the worst case doubles the run's image cost and nothing recurses. A
    # clean replacement takes the clipped one's slot; a clipped replacement
    # leaves the original in place. Either way the journal hears about it below
    # (debug.stages / debug.warnings) — quiet toward the customer, not the log.
    edge_notes: list[str] = []
    clipped = {i: edges for i, r in enumerate(renders) if (edges := clipped_edges(r))}
    if clipped:
        try:
            retry = await imagegen.render_many(
                openai_key, job.prompt, len(clipped), reference, model, size=job.size, quality=job.quality
            )
            replacements = retry.images
            imagegen.merge_usage(usage, retry.usage)
        except imagegen.ImageGenError as exc:
            replacements = []
            edge_notes.append(f"clipped-render retry failed: {exc}")
        indices = list(clipped)
        for i, replacement in zip(indices, replacements):
            at = "+".join(clipped[i])
            again = clipped_edges(replacement)
            if again:
                edge_notes.append(
                    f"render {i} clipped at {at}; retry clipped too ({'+'.join(again)}), kept the original"
                )
            else:
                renders[i] = replacement
                edge_notes.append(f"render {i} clipped at {at}; replaced after one retry")
        # render_many returns whatever succeeded — a short list leaves the tail
        # of the clipped renders as they were, and that is worth a line each.
        for i in indices[len(replacements) :]:
            edge_notes.append(f"render {i} clipped at {'+'.join(clipped[i])}; no replacement came back")

    # One panel per piece of every render. A render holding a single piece
    # passes through untouched, so the common case costs nothing.
    #
    # Capped at what was *asked for*, with headroom. split_panels returns a
    # panel per band it detected, not per row requested: a noisy render can
    # yield dozens, each one a 15-candidate pipeline, and the run then blows
    # through forme's 240s and nginx's 300s while the box keeps computing for
    # an hour on an answer nobody is waiting for. The extra panels are also the
    # least likely to be real pieces — they are the noise that produced them.
    panels: list[bytes] = []
    for data in renders:
        found = split_panels(data, job.cols)
        if len(found) > PANELS_PER_RENDER_CAP * job.rows * job.cols:
            keep = max(1, PANELS_PER_RENDER_CAP * job.rows * job.cols)
            log.warning(
                "render split into %d panels for a %dx%d grid; keeping %d",
                len(found), job.rows, job.cols, keep,
            )
            edge_notes.append(f"render split into {len(found)} panels, kept {keep}")
            found = found[:keep]
        panels.extend(found)
    log.info(
        "generate: model=%s calls=%d grid=%dx%d panels=%d", model, job.calls, job.rows, job.cols, len(panels)
    )

    # The trace is CPU-bound; run it off the event loop, a few at a time, so the
    # box stays responsive and its memory stays bounded no matter what forme asks
    # for.
    limit = asyncio.Semaphore(max(1, concurrency))

    async def trace(panel: bytes):
        async with limit:
            try:
                return await anyio.to_thread.run_sync(
                    _trace, panel, job.height_mm, job.color_key, job.min_hole_mm
                )
            except Exception as exc:  # a panel the pipeline cannot read is not a failed run
                # Swallowed toward the customer, not toward us. A systematic bug
                # takes out every panel of every run and forme only ever sees
                # status="rejected" — with nothing on the box to diagnose it
                # from, because until now this except returned None in silence.
                #
                # And that is exactly what happened: `MIN_IMAGE_DIMENSION` was
                # rejecting every piece thinner than proportion 14.06 (see
                # config.py), every run, for months — and because the loss left
                # no trace on this side it read as the image model's own
                # ceiling. The log line lives on the box; this note travels back
                # with the run, which is the difference between a diagnosis and
                # a guess.
                log.exception("panel trace failed")
                edge_notes.append(f"panel trace failed: {type(exc).__name__}: {exc}")
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
    if reference is not None and "reference" in artifacts.stages:
        labelled.append(("stage:reference", artifacts.stages["reference"], reference[0]))
    if selected is not None:
        images = _stage_images(selected)
        labelled += [
            (f"stage:{name}", url, images[name]) for name, url in artifacts.stages.items() if name in images
        ]
    landed = set(await uploads.put_all([(url, data) for _, url, data in labelled]))
    uploaded = [label for label, url, _ in labelled if url in landed]

    payload: dict = {
        "model": model,
        "rows": job.rows,
        "cols": job.cols,
        "size": imagegen.resolve_size(job.size),
        "quality": imagegen.resolve_quality(job.quality),
        "calls": job.calls,
        "usage": usage,
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
        # The edge check ran before any pipeline stage, on the whole render, so
        # it reads first in the timeline — and its notes double as warnings, so
        # the journal shows what was replaced without anyone opening the box.
        debug["stages"] = [
            {
                "name": "edges",
                "status": "warn" if edge_notes else "ok",
                "detail": "; ".join(edge_notes) or "no metal touching the canvas edge",
            },
            *debug.get("stages", []),
        ]
        if edge_notes:
            debug["warnings"] = [*debug.get("warnings", []), *edge_notes]
        sel = selected.selection.selected
        payload.update(pipeline.to_result_dict(selected))
        payload["debug"] = debug
        if sel is not None:
            payload["cutouts_svg"] = sel.cutouts_svg
    else:
        payload["status"] = "rejected"
    return payload
