"""Writing artefacts straight to forme's object storage.

The renders and the stage images are megabytes; routing them back through the
Worker so it can upload them is what made one generation buffer ~10MB inside a
128MB isolate. The box uploads them itself.

It holds no credentials to do it. forme mints a short-lived *signed upload URL*
per path and hands those over with the job, so the storage key never leaves the
Worker and the box can only write the exact paths it was given.
"""

from __future__ import annotations

import asyncio

import httpx

TIMEOUT_S = 60.0


async def _put(client: httpx.AsyncClient, url: str, data: bytes, content_type: str) -> bool:
    try:
        resp = await client.put(
            url,
            content=data,
            headers={"content-type": content_type, "x-upsert": "true"},
        )
        return resp.status_code < 400
    except httpx.HTTPError:
        return False


async def put_all(items: list[tuple[str, bytes]], content_type: str = "image/png") -> list[str]:
    """Upload each (signed URL, bytes) pair. Returns the URLs that succeeded.

    Best-effort by design: a missing stage image costs the back office one
    picture, and is never a reason to fail a generation the customer is waiting
    on.
    """
    if not items:
        return []
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        ok = await asyncio.gather(*(_put(client, url, data, content_type) for url, data in items))
    return [url for (url, _), good in zip(items, ok) if good]
