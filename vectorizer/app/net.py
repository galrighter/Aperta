"""URL guard for the blind PUT-to-signed-URL upload step (SSRF hardening).

The box uploads artefacts by PUTting them to signed URLs it is handed with the
job. Without a check it would PUT to *any* URL, which turns it into a blind-PUT
proxy against internal addresses (the geometry service on the same box, cloud
metadata, the LAN). This module decides where a PUT may go; it imports only the
standard library so it stays trivially testable.
"""

from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

_INTERNAL_NAMES = {"localhost", "metadata.google.internal"}


def _host_is_internal(host: str) -> bool:
    h = host.lower().strip(".")
    if h in _INTERNAL_NAMES:
        return True
    try:
        ip = ipaddress.ip_address(h)
    except ValueError:
        return False  # a name, not an IP literal — cannot classify here
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def is_upload_url_allowed(url: str, allowed_hosts: tuple[str, ...] = ()) -> bool:
    """Whether a signed upload URL is safe to PUT to.

    Always require https and refuse internal/loopback/link-local targets — the
    real SSRF danger. When ``allowed_hosts`` is non-empty the host must also be
    a member (set it to the storage host in production for a full lockdown).
    """
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    if not host or _host_is_internal(host):
        return False
    if allowed_hosts and host not in allowed_hosts:
        return False
    return True
