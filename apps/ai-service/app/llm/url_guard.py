"""SSRF guard for provider `baseUrl` values supplied per request (ADR-017).

`apps/api` forwards the Admin-configured provider list, so `baseUrl` is
attacker-controlled if an Admin account is taken over. Only plain http/https
endpoints on public hosts are accepted; loopback, private, link-local and
cloud-metadata addresses are rejected before any request is made.

Scope note: the host is *not* resolved here, so a public hostname that resolves
to a private address (DNS rebinding) is still reachable. Closing that needs a
pinned resolver or an egress proxy and is tracked separately.
"""

from __future__ import annotations

import ipaddress
from urllib.parse import urlsplit

from app.llm.base import ProviderInvalidConfig

ALLOWED_SCHEMES = frozenset({"http", "https"})

# Hostnames that never denote a public provider endpoint.
BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "localhost.localdomain",
        "metadata",
        "metadata.google.internal",
    }
)


def validate_base_url(base_url: str, *, provider_id: str = "") -> str:
    """Return `base_url` unchanged when safe, else raise `ProviderInvalidConfig`."""
    if not base_url:
        raise ProviderInvalidConfig("baseUrl is required", provider_id=provider_id)

    parts = urlsplit(base_url)
    scheme = (parts.scheme or "").lower()
    if scheme not in ALLOWED_SCHEMES:
        raise ProviderInvalidConfig(
            f"baseUrl scheme {scheme or '<none>'} is not allowed",
            provider_id=provider_id,
        )

    host = (parts.hostname or "").strip().lower()
    if not host:
        raise ProviderInvalidConfig("baseUrl is missing a host", provider_id=provider_id)

    if host in BLOCKED_HOSTNAMES or host.endswith(".localhost"):
        raise ProviderInvalidConfig(
            "baseUrl host is not allowed", provider_id=provider_id
        )

    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        # Not an IP literal: a regular DNS name. Resolution is deliberately skipped.
        return base_url

    if (
        address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
    ):
        raise ProviderInvalidConfig(
            "baseUrl host is not allowed", provider_id=provider_id
        )

    return base_url
