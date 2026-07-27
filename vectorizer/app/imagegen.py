"""Renders of the piece, from the image model.

This ran in the Cloudflare Worker until the fan-out killed it: a low aspect
ratio makes the planner ask for four renders, and four 1536x1024 PNGs decoded,
cropped and re-encoded inside one Worker invocation exceeds what an isolate is
allowed to spend. Here the calls are ordinary I/O and the bytes stay in process.

The *prompt* is still built by forme — it encodes the fabrication minimums from
resolveFab(), and a second copy of those numbers here is exactly the kind of
duplication that drifts. This module only executes what it is handed.

Cost (the most expensive knob in the pipeline — kept in numbers so it cannot go
missing): gpt-image-1-mini - low - 1536x1024 = ~$0.006 per render. There is no
fallback to a pricier model on purpose: a silent fallback that costs forty times
more is precisely the spend nobody sees in the code.
"""

from __future__ import annotations

import asyncio
import base64

import httpx

MODEL = "gpt-image-1-mini"
SIZE = "1536x1024"
QUALITY = "low"
TIMEOUT_S = 120.0


class ImageGenError(RuntimeError):
    """The image model did not return a render."""

    def __init__(self, message: str, retriable: bool = True) -> None:
        super().__init__(message)
        self.retriable = retriable


def _extract(payload: dict) -> bytes:
    items = payload.get("data") or []
    b64 = items[0].get("b64_json") if items else None
    if not b64:
        raise ImageGenError("no image in response")
    return base64.b64decode(b64)


async def _one(
    client: httpx.AsyncClient,
    key: str,
    prompt: str,
    inspiration: tuple[bytes, str] | None,
) -> bytes:
    headers = {"authorization": f"Bearer {key}"}
    if inspiration is not None:
        data, media_type = inspiration
        # The edits endpoint defaults to high quality — say it explicitly, or the
        # inspiration path silently costs ten times the text path for one image.
        resp = await client.post(
            "https://api.openai.com/v1/images/edits",
            headers=headers,
            data={"model": MODEL, "prompt": prompt, "size": SIZE, "quality": QUALITY},
            files={"image": ("inspiration.png", data, media_type)},
        )
    else:
        resp = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers={**headers, "content-type": "application/json"},
            json={"model": MODEL, "prompt": prompt, "n": 1, "size": SIZE, "quality": QUALITY},
        )
    if resp.status_code >= 400:
        raise ImageGenError(f"{MODEL}: {resp.status_code} {resp.text[:200]}")
    return _extract(resp.json())


async def render_many(
    key: str,
    prompt: str,
    calls: int,
    inspiration: tuple[bytes, str] | None = None,
) -> list[bytes]:
    """Ask the model for `calls` renders of the same prompt, concurrently.

    Every render is a separate variation the customer can choose between, so a
    failure of one is not a failure of the run: whatever came back is returned,
    and only an empty result is an error.
    """
    if not key:
        raise ImageGenError("OPENAI_KEY is not configured for image generation", retriable=False)

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        results = await asyncio.gather(
            *(_one(client, key, prompt, inspiration) for _ in range(max(1, calls))),
            return_exceptions=True,
        )

    images = [r for r in results if isinstance(r, bytes)]
    if not images:
        reasons = " | ".join(str(r) for r in results if isinstance(r, BaseException))
        raise ImageGenError(f"Image generation failed. {reasons}")
    return images
