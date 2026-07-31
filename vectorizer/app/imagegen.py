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
*fallback* to a pricier model on purpose: a silent fallback that costs forty
times more is precisely the spend nobody sees in the code.

forme may name a different model per run, from ALLOWED_MODELS below — never a
fallback, always an explicit choice made where the reason lives. The one that
exists today: a run carrying lettering asks for gpt-image-2, because
gpt-image-1-mini rewrites the reference lettering into longer text whose stray
letters survive next to the piece (measured 31/07; see forme's
docs/research/HEBREW_TEXT_LETTERING_FIELD.md §6.6).
"""

from __future__ import annotations

import asyncio
import base64

import httpx

MODEL = "gpt-image-1-mini"

# What forme is allowed to ask for. An allowlist and not a pass-through: the
# model name reaches OpenAI on our key, and "whatever the caller sent" is how a
# typo becomes a bill.
ALLOWED_MODELS = frozenset({"gpt-image-1-mini", "gpt-image-1", "gpt-image-2"})
SIZE = "1536x1024"
QUALITY = "low"
TIMEOUT_S = 120.0


# A spent OpenAI budget is not a failure anyone can retry their way out of, and
# it is the one cause that looks identical to every other outage from the outside
# — so it gets its own flag, read off the words OpenAI puts in the 429 body.
QUOTA_MARKERS = (
    "insufficient_quota",
    "billing_hard_limit_reached",
    "exceeded your current quota",
)


def _is_quota(body: str) -> bool:
    low = body.lower()
    return any(marker in low for marker in QUOTA_MARKERS)


class ImageGenError(RuntimeError):
    """The image model did not return a render."""

    def __init__(self, message: str, retriable: bool = True, quota: bool = False) -> None:
        super().__init__(message)
        self.retriable = retriable
        # The budget ran out. Nothing on the box or in forme is broken, and no
        # amount of retrying will change it — someone has to top up the account.
        self.quota = quota


def resolve_model(name: str | None) -> str:
    """The model this run will use. An unknown name is an error, not a default:
    silently rendering with the wrong model is a result nobody can explain."""
    if not name:
        return MODEL
    if name not in ALLOWED_MODELS:
        raise ImageGenError(f"unknown image model {name!r}", retriable=False)
    return name


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
    reference: tuple[bytes, str] | None,
    model: str = MODEL,
) -> bytes:
    headers = {"authorization": f"Bearer {key}"}
    if reference is not None:
        data, media_type = reference
        # The edits endpoint defaults to high quality — say it explicitly, or the
        # reference path silently costs ten times the text path for one image.
        resp = await client.post(
            "https://api.openai.com/v1/images/edits",
            headers=headers,
            data={"model": model, "prompt": prompt, "size": SIZE, "quality": QUALITY},
            files={"image": ("reference.png", data, media_type)},
        )
    else:
        resp = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers={**headers, "content-type": "application/json"},
            json={"model": model, "prompt": prompt, "n": 1, "size": SIZE, "quality": QUALITY},
        )
    if resp.status_code >= 400:
        quota = _is_quota(resp.text)
        raise ImageGenError(
            f"{model}: {resp.status_code} {resp.text[:200]}",
            retriable=not quota,
            quota=quota,
        )
    return _extract(resp.json())


async def render_many(
    key: str,
    prompt: str,
    calls: int,
    reference: tuple[bytes, str] | None = None,
    model: str | None = None,
) -> list[bytes]:
    """Ask the model for `calls` renders of the same prompt, concurrently.

    `reference`, when given, goes to the edits endpoint as the image to work
    from — either the customer's inspiration on a new design, or the design
    itself on an edit. The prompt (built by forme) says which of the two it is.

    Every render is a separate variation the customer can choose between, so a
    failure of one is not a failure of the run: whatever came back is returned,
    and only an empty result is an error.
    """
    if not key:
        raise ImageGenError("OPENAI_KEY is not configured for image generation", retriable=False)
    chosen = resolve_model(model)

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        results = await asyncio.gather(
            *(_one(client, key, prompt, reference, chosen) for _ in range(max(1, calls))),
            return_exceptions=True,
        )

    images = [r for r in results if isinstance(r, bytes)]
    if not images:
        failures = [r for r in results if isinstance(r, BaseException)]
        reasons = " | ".join(str(r) for r in failures)
        # One spent budget is the whole run's cause, even if a second call failed
        # for its own reason: the flag has to survive the aggregation, or forme
        # sees a generic failure and nobody learns that the account is empty.
        quota = any(getattr(f, "quota", False) for f in failures)
        raise ImageGenError(f"Image generation failed. {reasons}", retriable=not quota, quota=quota)
    return images
