"""Shared fixtures for the vectorizer tests.

The job and generate endpoints sit behind a bearer-token gate that fails closed:
with no ``VECTORIZER_TOKEN`` configured they refuse everything with 503, because
an open endpoint here spends the OpenAI key. Tests run without that variable, so
every endpoint test has to configure a token and send it — otherwise it asserts
against 503 and proves nothing about the handler underneath.

The client fixtures below do that once. They patch the *real* Settings (frozen,
hence ``replace``) rather than substituting a stand-in object: a fake settings
namespace only carries the fields someone remembered to fake, and the day the
handler reads one more setting the test fails somewhere far from the cause.
"""

from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.api import main
from app.config import SETTINGS

# Any non-empty value works — what the gate cares about is that a token *is*
# configured. This one is shared so a test can send it explicitly when it wants
# to exercise the header itself.
TOKEN = "test-token"


@pytest.fixture
def auth_configured(monkeypatch) -> str:
    """Configure a token on the endpoints, and hand it back."""
    monkeypatch.setattr(main, "SETTINGS", replace(SETTINGS, auth_token=TOKEN))
    return TOKEN


@pytest.fixture
def client(auth_configured: str) -> TestClient:
    """An authorised client — what a test that is about the handler wants."""
    return TestClient(main.app, headers={"Authorization": f"Bearer {auth_configured}"})


@pytest.fixture
def unauthorised_client(auth_configured: str) -> TestClient:
    """A client that sends no credentials, for testing the gate itself."""
    return TestClient(main.app)
