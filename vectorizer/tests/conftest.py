"""Shared fixtures for the vectorizer tests.

The API fails closed: with no `VECTORIZER_TOKEN` configured, `require_auth`
answers `503 AUTH_NOT_CONFIGURED` on every gated route (see `app/api/main.py`).
That is the behaviour we want in production — an open endpoint here spends the
OpenAI key — but it also means a test that merely builds a `TestClient` is
talking to a service that refuses everything. When the gate landed, nine
endpoint tests started asserting 503 against the status they expected, because
each one configures nothing and sends no token.

So the token is configured in one place, here, and `client` hands out a
`TestClient` that carries it. The gate itself is not fixture-ed away — it is
covered directly in `test_pipeline.py` (no token → 503, wrong token → 401,
right token → through), which is the only place that should be building its own
unauthenticated client.
"""

from __future__ import annotations

import dataclasses

import pytest
from fastapi.testclient import TestClient

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(monkeypatch) -> TestClient:
    """A TestClient for an app with a token configured, sending that token.

    `Settings` is a frozen dataclass, so the token is applied with
    `dataclasses.replace` — every other setting keeps its real value, which a
    hand-rolled stand-in would silently drop.
    """
    from app.api import main

    monkeypatch.setattr(main, "SETTINGS", dataclasses.replace(main.SETTINGS, auth_token=TOKEN))
    return TestClient(main.app, headers=AUTH)
