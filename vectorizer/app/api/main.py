"""HTTP layer — the vectorizer as a service forme (on Cloudflare) calls over HTTP.

Synchronous processing per the MVP recommendation: POST /api/jobs runs the
pipeline and returns result.json inline; output files are also persisted to the
job directory and served via GET /api/jobs/{id}/files/{name}.
"""

from __future__ import annotations

import base64
import json

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .. import generate, imagegen, pipeline
from ..config import SETTINGS
from ..core.renderer import RenderError
from ..core.validation import InputError
from ..storage.job_storage import STORE

app = FastAPI(title="raster-to-svg vectorizer", version="0.1.0")


def require_auth(authorization: str = Header(default="")) -> None:
    """When VECTORIZER_TOKEN is configured, gate the job endpoints on a bearer token."""
    if not SETTINGS.auth_token:
        return
    expected = f"Bearer {SETTINGS.auth_token}"
    if authorization != expected:
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
    height_mm: float = Field(default=15.0, gt=0, le=100)
    color_key: str = "coverage"
    # forme's minimum opening (mm). It owns the fabrication rules; we only apply
    # this one so openings the cutter cannot make never reach the SVG. 0 = keep all.
    min_hole_mm: float = Field(default=0.0, ge=0, le=5)
    inspiration: InspirationIn | None = None
    # An edit: the design as it stands, already drawn as a render would look.
    # We rasterise it and hand it to the image model as the reference.
    base_svg: str | None = Field(default=None, max_length=2_000_000)
    artifacts: ArtifactsIn = Field(default_factory=ArtifactsIn)


@app.post("/api/generate", dependencies=[Depends(require_auth)])
async def create_generation(body: GenerateIn) -> JSONResponse:
    """Render, split, trace, upload — the heavy half of forme's /api/generate.

    Returns every panel's cutouts with the tracer's verdict. Whether a candidate
    can actually be manufactured is forme's call, not ours: that engine stays in
    one place.
    """
    if body.color_key not in ("coverage", "warm", "dark", "saturation", "auto"):
        raise HTTPException(400, detail={"error_code": "INVALID_DIMENSIONS", "message": "bad color_key"})

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
        height_mm=body.height_mm,
        color_key=body.color_key,
        inspiration=inspiration,
        base_svg=body.base_svg,
        min_hole_mm=body.min_hole_mm,
    )
    artifacts = generate.Artifacts(renders=body.artifacts.renders, stages=body.artifacts.stages)

    try:
        payload = await generate.run(job, artifacts, SETTINGS.openai_key, SETTINGS.generate_concurrency)
    except imagegen.ImageGenError as exc:
        # The image model, not us: forme surfaces this as a retriable failure.
        raise HTTPException(502, detail={"error_code": "RENDER_FAILED", "message": str(exc)}) from exc

    return JSONResponse(status_code=200, content=payload)


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
