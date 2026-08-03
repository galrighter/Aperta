"""HTTP layer — the vectorizer as a service forme (on Cloudflare) calls over HTTP.

Synchronous processing per the MVP recommendation: POST /api/jobs runs the
pipeline and returns result.json inline; output files are also persisted to the
job directory and served via GET /api/jobs/{id}/files/{name}.
"""

from __future__ import annotations

import base64
import json
import secrets

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .. import generate, imagegen, pipeline
from ..config import SETTINGS
from ..core.renderer import RenderError
from ..core.validation import InputError
from ..storage.generation_store import DONE, ERROR, GENERATIONS, Failure, GenerationRecord, valid_id
from ..storage.job_storage import STORE

app = FastAPI(title="raster-to-svg vectorizer", version="0.1.0")


def require_auth(authorization: str = Header(default="")) -> None:
    """Gate the job/generate endpoints on a bearer token.

    Fails closed: with no VECTORIZER_TOKEN configured the endpoints refuse
    everything rather than run open — an open endpoint here spends the OpenAI
    key. The comparison is constant-time to avoid leaking the token via timing.
    """
    if not SETTINGS.auth_token:
        raise HTTPException(503, detail={"error_code": "AUTH_NOT_CONFIGURED"})
    expected = f"Bearer {SETTINGS.auth_token}"
    if not secrets.compare_digest(authorization, expected):
        raise HTTPException(401, detail={"error_code": "UNAUTHORIZED"})


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "tracer_backend": SETTINGS.tracer_backend}


@app.post("/api/jobs", dependencies=[Depends(require_auth)])
async def create_job(
    image: UploadFile = File(...),
    height_mm: float = Form(...),
    width_mm: float = Form(0.0),  # derived from the crop when condition=true
    dark_region_role: str = Form("metal"),
    output_mode: str = Form("both"),
    condition: bool = Form(False),
    color_key: str = Form("coverage"),
    min_hole_mm: float = Form(0.0),
    debug: bool = Form(False),
) -> JSONResponse:
    data = await image.read()
    if len(data) > SETTINGS.max_upload_mb * 1_000_000:
        raise HTTPException(413, detail={"error_code": "FILE_TOO_LARGE"})
    if dark_region_role not in ("metal", "background"):
        raise HTTPException(400, detail={"error_code": "INVALID_DIMENSIONS", "message": "bad dark_region_role"})
    if color_key not in ("coverage", "warm", "dark", "saturation", "auto"):
        raise HTTPException(400, detail={"error_code": "INVALID_DIMENSIONS", "message": "bad color_key"})
    if not condition and width_mm <= 0:
        raise HTTPException(400, detail={"error_code": "INVALID_DIMENSIONS", "message": "width_mm required unless condition=true"})

    rec = STORE.create()
    try:
        res = pipeline.run_pipeline(
            data, width_mm, height_mm, dark_region_role, output_mode, condition, color_key, min_hole_mm
        )
    except InputError as exc:
        rec.status = "rejected"
        rec.error_code = exc.code
        rec.error_message = exc.message
        return JSONResponse(
            status_code=422,
            content={"job_id": rec.job_id, "status": "rejected", "error_code": exc.code, "error_message": exc.message},
        )
    except ValueError as exc:  # conditioning could not find metal
        rec.status = "rejected"
        rec.error_code = "NO_FOREGROUND_FOUND"
        rec.error_message = str(exc)
        return JSONResponse(
            status_code=422,
            content={"job_id": rec.job_id, "status": "rejected", "error_code": "NO_FOREGROUND_FOUND", "error_message": str(exc)},
        )
    except RenderError as exc:
        rec.status = "failed"
        rec.error_code = "RENDER_FAILED"
        rec.error_message = str(exc)
        raise HTTPException(500, detail={"error_code": "RENDER_FAILED", "message": str(exc)}) from exc

    result = pipeline.to_result_dict(res)
    rec.status = res.status
    rec.result = result

    STORE.write_file(rec, "result.json", json.dumps(result, indent=2).encode())
    sel = res.selection.selected
    if sel is not None and res.rendered_mask is not None:
        STORE.write_file(rec, "metal.svg", sel.metal_svg.encode())
        STORE.write_file(rec, "cutouts.svg", sel.cutouts_svg.encode())
        STORE.write_file(rec, "rendered.png", pipeline.mask_png(res.rendered_mask))
        STORE.write_file(rec, "difference.png", pipeline.difference_image(res.source_mask, res.rendered_mask))
        STORE.write_file(rec, "overlay.png", pipeline.overlay_image(res.image, res.rendered_mask))

    # inline the SVGs so forme can consume them without a second round-trip
    payload = {"job_id": rec.job_id, **result}
    if sel is not None:
        payload["cutouts_svg"] = sel.cutouts_svg
        payload["metal_svg"] = sel.metal_svg
    if debug:
        payload["debug"] = pipeline.build_debug(res)
    return JSONResponse(status_code=200, content=payload)


class InspirationIn(BaseModel):
    media_type: str = "image/png"
    base64: str


class ArtifactsIn(BaseModel):
    """Signed upload URLs forme minted for this run — the only writes we can do."""

    renders: list[str] = Field(default_factory=list)
    stages: dict[str, str] = Field(default_factory=dict)


class GenerateIn(BaseModel):
    """A whole customer generation. Every decision here was made by forme."""

    prompt: str
    calls: int = Field(default=1, ge=1, le=8)
    rows: int = Field(default=1, ge=1, le=8)
    # Columns in the render; the cut is a grid of rows x cols. A short piece (a
    # ring) has room for a second column, which multiplies the alternatives
    # without changing the shape of the cell. See src/lib/render/panels.ts.
    cols: int = Field(default=1, ge=1, le=4)
    height_mm: float = Field(default=15.0, gt=0, le=100)
    color_key: str = "coverage"
    # forme's minimum opening (mm). It owns the fabrication rules; we only apply
    # this one so openings the cutter cannot make never reach the SVG. 0 = keep all.
    min_hole_mm: float = Field(default=0.0, ge=0, le=5)
    inspiration: InspirationIn | None = None
    # An edit: the design as it stands, already drawn as a render would look.
    # We rasterise it and hand it to the image model as the reference.
    base_svg: str | None = Field(default=None, max_length=2_000_000)
    # The canvas to draw on, "WIDTHxHEIGHT". None = landscape, the only shape
    # that existed before forme started choosing. Validated against
    # imagegen.ALLOWED_SIZES for the same reason as the model: it reaches OpenAI
    # on our key.
    size: str | None = None
    # Which image model to render with. Validated against imagegen.ALLOWED_MODELS
    # rather than passed through: the name goes to OpenAI on our key.
    model: str | None = None
    artifacts: ArtifactsIn = Field(default_factory=ArtifactsIn)
    # An id forme derived from its own job id (see docs/C2_RESILIENT_GENERATION.md).
    # Supplying it moves the run into the background and makes it *addressable*:
    # the same id posted again joins the run in flight, or gets the finished
    # result back, instead of paying the image model a second time. Omitted =
    # the old synchronous behaviour, which is what a Worker deployed before this
    # still asks for.
    job_id: str | None = None


@app.post("/api/generate", dependencies=[Depends(require_auth)])
async def create_generation(body: GenerateIn) -> JSONResponse:
    """Render, split, trace, upload — the heavy half of forme's /api/generate.

    Returns every panel's cutouts with the tracer's verdict. Whether a candidate
    can actually be manufactured is forme's call, not ours: that engine stays in
    one place.

    With `job_id`, answers 202 immediately and runs in the background; forme
    polls `GET /api/generate/{job_id}`. That is what keeps a dropped connection
    from losing a run the image model was already billed for.
    """
    if body.color_key not in ("coverage", "warm", "dark", "saturation", "auto"):
        raise HTTPException(400, detail={"error_code": "INVALID_DIMENSIONS", "message": "bad color_key"})
    if body.model is not None and body.model not in imagegen.ALLOWED_MODELS:
        raise HTTPException(400, detail={"error_code": "INVALID_DIMENSIONS", "message": "bad model"})
    if body.size is not None and body.size not in imagegen.ALLOWED_SIZES:
        raise HTTPException(400, detail={"error_code": "INVALID_DIMENSIONS", "message": "bad size"})

    inspiration = None
    if body.inspiration is not None:
        try:
            inspiration = (base64.b64decode(body.inspiration.base64), body.inspiration.media_type)
        except Exception as exc:
            raise HTTPException(400, detail={"error_code": "BAD_INSPIRATION", "message": str(exc)}) from exc

    job = generate.GenerateJob(
        prompt=body.prompt,
        calls=body.calls,
        rows=body.rows,
        cols=body.cols,
        height_mm=body.height_mm,
        color_key=body.color_key,
        inspiration=inspiration,
        base_svg=body.base_svg,
        min_hole_mm=body.min_hole_mm,
        model=body.model,
        size=body.size,
    )
    artifacts = generate.Artifacts(renders=body.artifacts.renders, stages=body.artifacts.stages)

    async def work() -> dict:
        try:
            return await generate.run(
                job, artifacts, SETTINGS.openai_key, SETTINGS.generate_concurrency
            )
        except imagegen.ImageGenError as exc:
            # The image model, not us: forme surfaces this as a retriable failure.
            #
            # 422 and not 502, which is what this used to be: forme reaches us from a
            # Cloudflare Worker, and Cloudflare replaces the *body* of a 502 with its
            # own error page. The JSON below never arrived — forme logged
            # "Render service returned non-JSON (502): error code: 502" on a run that
            # failed for a perfectly legible reason (30.7.26: the OpenAI budget ran
            # out, and the log said nothing about it). The status has to be one the
            # edge passes through untouched, or the reason dies in transit.
            code = "QUOTA_EXHAUSTED" if exc.quota else "RENDER_FAILED"
            raise Failure(422, code, str(exc)) from exc

    if body.job_id is None:
        try:
            return JSONResponse(status_code=200, content=await work())
        except Failure as exc:
            raise HTTPException(exc.detail["status"], detail=_detail(exc.detail)) from exc

    if not valid_id(body.job_id):
        raise HTTPException(400, detail={"error_code": "BAD_JOB_ID", "message": "job_id must be a UUID"})
    rec, _started = GENERATIONS.start(body.job_id, work)
    return _generation_response(rec)


def _detail(detail: dict) -> dict:
    return {k: v for k, v in detail.items() if k != "status"}


def _generation_response(rec: GenerationRecord) -> JSONResponse:
    """One shape for both the POST and the GET.

    A finished run answers 200 with its result — the same body the synchronous
    path returns, so the caller does not branch on how it got there. A run still
    going answers 202, which is also what a *repeat* POST gets: it means "this
    is in hand", not "I started it just now".
    """
    if rec.state == DONE:
        return JSONResponse(status_code=200, content=rec.public())
    if rec.state == ERROR:
        return JSONResponse(status_code=(rec.error or {}).get("status", 500), content=rec.public())
    return JSONResponse(status_code=202, content=rec.public())


@app.get("/api/generate/{job_id}", dependencies=[Depends(require_auth)])
def generation_status(job_id: str) -> JSONResponse:
    """Where forme collects a run it started — including one whose POST it
    never saw the end of."""
    rec = GENERATIONS.get(job_id) if valid_id(job_id) else None
    if rec is None:
        raise HTTPException(404, detail={"error_code": "NOT_FOUND"})
    return _generation_response(rec)


@app.get("/api/jobs/{job_id}", dependencies=[Depends(require_auth)])
def job_status(job_id: str) -> dict:
    rec = STORE.get(job_id)
    if rec is None:
        raise HTTPException(404, detail={"error_code": "NOT_FOUND"})
    return {
        "job_id": rec.job_id,
        "status": rec.status,
        "error_code": rec.error_code,
        "result": rec.result or None,
    }


@app.get("/api/jobs/{job_id}/files/{filename}", dependencies=[Depends(require_auth)])
def job_file(job_id: str, filename: str) -> FileResponse:
    rec = STORE.get(job_id)
    if rec is None:
        raise HTTPException(404, detail={"error_code": "NOT_FOUND"})
    path = STORE.file_path(rec, filename)
    if path is None:
        raise HTTPException(404, detail={"error_code": "FILE_NOT_FOUND"})
    media = "image/svg+xml" if filename.endswith(".svg") else (
        "application/json" if filename.endswith(".json") else "image/png"
    )
    return FileResponse(path, media_type=media, filename=filename)


@app.delete("/api/jobs/{job_id}", dependencies=[Depends(require_auth)])
def delete_job(job_id: str) -> dict:
    ok = STORE.delete(job_id)
    if not ok:
        raise HTTPException(404, detail={"error_code": "NOT_FOUND"})
    return {"job_id": job_id, "deleted": True}
