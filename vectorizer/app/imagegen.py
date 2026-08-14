"""Renders of the piece, from the image model.

This ran in the Cloudflare Worker until the fan-out killed it: a low aspect
ratio makes the planner ask for four renders, and four 1536x1024 PNGs decoded,
cropped and re-encoded inside one Worker invocation exceeds what an isolate is
allowed to spend. Here the calls are ordinary I/O and the bytes stay in process.

The *prompt* is still built by forme — it encodes the fabrication minimums from
resolveFab(), and a second copy of those numbers here is exactly the kind of
duplication that drifts. This module only executes what it is handed.

Cost (the most expensive knob in the pipeline — kept in numbers so it cannot go
missing), measured 31/07 from the usage the API returns on exactly the request
this module sends, priced off developers.openai.com/api/docs/pricing:

    gpt-image-1-mini - low - 1536x1024 = $0.0057 per render, ~11s
    gpt-image-2      - low - 1536x1024 = $0.0212 per render, ~20s

Those two lines were measured by hand, once. Every render since then reports its
own usage and it is now kept (`Renders.usage` -> the payload -> forme's run log),
because a number that is only ever read off a pricing page is a number nobody
notices going stale — and the two knobs that move it, the model and the quality,
are both chosen per run.

3.7x, and the whole gap is the input image: gpt-image-2 encodes the reference at
4.75x the tokens. It is paying attention to it, which is also what the output
shows. There is no *fallback* to a pricier model on purpose: a silent fallback
that costs forty times more is precisely the spend nobody sees in the code.

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
from dataclasses import dataclass

import httpx

MODEL = "gpt-image-1-mini"

# What forme is allowed to ask for. An allowlist and not a pass-through: the
# model name reaches OpenAI on our key, and "whatever the caller sent" is how a
# typo becomes a bill.
ALLOWED_MODELS = frozenset({"gpt-image-1-mini", "gpt-image-1", "gpt-image-2"})

# The canvas shapes the model will draw on. An allowlist for the same reason as
# the models: the value reaches OpenAI on our key, and an unrecognised size is a
# 400 at best. Landscape is the default and was the only option until forme
# started choosing — see src/lib/render/canvas.ts for why it chooses.
SIZE = "1536x1024"
ALLOWED_SIZES = frozenset({"1536x1024", "1024x1536", "1024x1024"})


def resolve_size(size: str | None) -> str:
    """The requested canvas, or the default. An unknown value falls back rather
    than failing: a render on the wrong shape is recoverable, a dead run is not.
    """
    return size if size in ALLOWED_SIZES else SIZE


# How hard the model works on the picture. "low" is the default and was the only
# value until forme started choosing, and it is the single biggest lever on both
# cost and detail:
#
#     gpt-image-1-mini - low  - 1536x1024 = $0.0057
#     gpt-image-1-mini - high - 1536x1024 = $0.05
#     gpt-image-1      - high - 1536x1024 = $0.25
#
# It matters most where the picture is subdivided. A render split into three
# rows draws each piece in roughly 1380x170 px, and at 8.6 px/mm a 0.5mm opening
# is four pixels — "low" there returns blocks, not a design.
#
# Same allowlist reasoning as models and sizes: the value reaches OpenAI on our
# key, and an unrecognised one is a 400.
QUALITY = "low"
ALLOWED_QUALITIES = frozenset({"low", "medium", "high", "auto"})


def resolve_quality(quality: str | None) -> str:
    """The requested quality, or the default. Falls back rather than failing,
    for the same reason as the canvas."""
    return quality if quality in ALLOWED_QUALITIES else QUALITY

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


# What the API charges for, per call, under `usage`. Kept as flat counters and
# not as the provider's nested shape: this is what forme writes to the run log,
# and a shape that mirrors an external response is a shape that changes under us.
#
# `calls` is the count of responses that *reported* usage. It is not the number
# of renders: a response without a usage block still cost money, and a total
# divided by the wrong call count is worse than no per-render number at all.
USAGE_KEYS = ("input_tokens", "output_tokens", "total_tokens")
#: Inside `input_tokens_details`. The split is the whole story of the model
#: choice — see the 3.7x above, which is entirely `image_tokens`.
USAGE_DETAIL_KEYS = ("text_tokens", "image_tokens")


def empty_usage() -> dict:
    return {"calls": 0, **{k: 0 for k in USAGE_KEYS}, **{k: 0 for k in USAGE_DETAIL_KEYS}}


def add_usage(into: dict, usage: dict | None) -> dict:
    """Fold one response's `usage` into a running total.

    A missing or malformed block is skipped rather than raised on: usage is
    bookkeeping, and a run that renders fine must not fail because the provider
    changed a field name.
    """
    if not isinstance(usage, dict):
        return into
    into["calls"] += 1
    for key in USAGE_KEYS:
        into[key] += int(usage.get(key) or 0)
    details = usage.get("input_tokens_details")
    if isinstance(details, dict):
        for key in USAGE_DETAIL_KEYS:
            into[key] += int(details.get(key) or 0)
    return into


def merge_usage(into: dict, other: dict) -> dict:
    """Two totals into one. A run can call the model more than once — the clipped
    render retry in generate.run() — and each of those renders was paid for
    whether or not its picture was kept."""
    for key, value in other.items():
        into[key] = into.get(key, 0) + int(value or 0)
    return into


@dataclass(frozen=True)
class Renders:
    """What came back, and what it cost. The two travel together on purpose:
    usage that has to be fetched separately is usage that gets dropped at the
    first call site that only wanted the pictures."""

    images: list[bytes]
    usage: dict


def _extract(payload: dict) -> tuple[bytes, dict | None]:
    items = payload.get("data") or []
    b64 = items[0].get("b64_json") if items else None
    if not b64:
        raise ImageGenError("no image in response")
    usage = payload.get("usage")
    return base64.b64decode(b64), usage if isinstance(usage, dict) else None


async def _one(
    client: httpx.AsyncClient,
    key: str,
    prompt: str,
    reference: tuple[bytes, str] | None,
    model: str = MODEL,
    size: str = SIZE,
    quality: str = QUALITY,
) -> tuple[bytes, dict | None]:
    headers = {"authorization": f"Bearer {key}"}
    if reference is not None:
        data, media_type = reference
        # The edits endpoint defaults to high quality — say it explicitly, or the
        # reference path silently costs ten times the text path for one image.
        # background is pinned to opaque on both endpoints: the default (auto)
        # lets the model return a TRANSPARENT PNG at its own discretion, with
        # junk RGB under the transparent pixels — and everything downstream
        # that reads pixels (conditioning, band splitting, the admin's
        # difference views) then depends on who remembered to composite.
        # Conditioning also flattens for itself (condition_png), so this is the
        # source-level half of the same fix — old renders re-collected from
        # storage still go through the flatten.
        resp = await client.post(
            "https://api.openai.com/v1/images/edits",
            headers=headers,
            data={"model": model, "prompt": prompt, "size": size, "quality": quality, "background": "opaque"},
            files={"image": ("reference.png", data, media_type)},
        )
    else:
        resp = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers={**headers, "content-type": "application/json"},
            json={"model": model, "prompt": prompt, "n": 1, "size": size, "quality": quality, "background": "opaque"},
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
    size: str | None = None,
    quality: str | None = None,
) -> Renders:
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
    canvas = resolve_size(size)
    effort = resolve_quality(quality)

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        results = await asyncio.gather(
            *(
                _one(client, key, prompt, reference, chosen, size=canvas, quality=effort)
                for _ in range(max(1, calls))
            ),
            return_exceptions=True,
        )

    usage = empty_usage()
    images: list[bytes] = []
    for result in results:
        if isinstance(result, tuple):
            image, reported = result
            images.append(image)
            add_usage(usage, reported)
    if not images:
        failures = [r for r in results if isinstance(r, BaseException)]
        reasons = " | ".join(str(r) for r in failures)
        # One spent budget is the whole run's cause, even if a second call failed
        # for its own reason: the flag has to survive the aggregation, or forme
        # sees a generic failure and nobody learns that the account is empty.
        quota = any(getattr(f, "quota", False) for f in failures)
        raise ImageGenError(f"Image generation failed. {reasons}", retriable=not quota, quota=quota)
    return Renders(images=images, usage=usage)
