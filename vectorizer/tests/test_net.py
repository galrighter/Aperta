"""Tests for the upload URL guard (SSRF hardening). Stdlib only — no service deps."""

from app.net import is_upload_url_allowed


def test_allows_a_plain_https_public_host():
    assert is_upload_url_allowed("https://ref.supabase.co/storage/v1/object/x")


def test_rejects_http():
    assert not is_upload_url_allowed("http://ref.supabase.co/storage/v1/object/x")


def test_rejects_loopback_and_internal_targets():
    assert not is_upload_url_allowed("https://127.0.0.1:8100/api/frame")
    assert not is_upload_url_allowed("https://localhost/x")
    assert not is_upload_url_allowed("https://169.254.169.254/latest/meta-data")  # cloud metadata
    assert not is_upload_url_allowed("https://10.0.0.5/x")  # private LAN
    assert not is_upload_url_allowed("https://192.168.1.9/x")


def test_allowlist_when_set_restricts_to_members():
    allowed = ("ref.supabase.co",)
    assert is_upload_url_allowed("https://ref.supabase.co/x", allowed)
    assert not is_upload_url_allowed("https://evil.com/x", allowed)


def test_empty_allowlist_still_blocks_internal_but_permits_public():
    assert is_upload_url_allowed("https://ref.supabase.co/x", ())
    assert not is_upload_url_allowed("https://127.0.0.1/x", ())
