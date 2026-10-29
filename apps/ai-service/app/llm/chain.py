"""Provider chain with priority fallback and a 60s config cache (ADR-017).

`apps/api` decrypts the Admin-configured providers and passes them per request,
tagged with `configVersion`. The cache key is a hash of the whole payload (with
`configVersion` as a readable prefix), so any settings change invalidates
instantly; every entry also expires after
`AI_PROVIDER_CACHE_TTL_SECONDS` (default 60) to bound key material in memory.

Exhausting the chain is reported as `LLMUnavailable` (HTTP 503 at the boundary) or,
when at least one provider answered with a quota/timeout error, callers may choose
`degraded-structured` (docs/08-algorithms.md §6.3).
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from typing import Any

from app.config import settings
from app.llm.base import (
    ChatMessage,
    CompletionOptions,
    CompletionResult,
    EmbeddingResult,
    LLMProvider,
    LLMUnavailable,
    ProviderConfig,
    ProviderError,
)
from app.llm.fake import FakeProvider
from app.llm.gemini import GeminiProvider
from app.llm.openai_compatible import OpenAICompatibleProvider

logger = logging.getLogger("ai.llm.chain")

_BUILDERS = {
    "openai_compatible": OpenAICompatibleProvider,
    "gemini": GeminiProvider,
    "fake": FakeProvider,
}


def build_provider(payload: ProviderConfig) -> LLMProvider:
    builder = _BUILDERS.get(payload.type)
    if builder is None:
        raise ProviderError(f"unsupported provider type: {payload.type}", provider_id=payload.id)
    return builder(payload)


def build_chain(payload: dict[str, Any] | list[dict[str, Any]] | None) -> "ProviderChain":
    """Build a chain from the request payload; invalid providers are skipped."""
    raw_providers = payload.get("providers") if isinstance(payload, dict) else payload
    providers: list[LLMProvider] = []
    errors: list[dict[str, str]] = []
    for raw in raw_providers or []:
        if not isinstance(raw, dict):
            continue
        try:
            config = ProviderConfig.from_payload(raw)
        except (TypeError, ValueError):
            errors.append({"providerId": "unknown", "code": "INVALID_PROVIDER_CONFIG"})
            continue
        if not config.enabled:
            continue
        try:
            providers.append(build_provider(config))
        except Exception as exc:  # noqa: BLE001 - config error must not crash the service
            code = getattr(exc, "code", "INVALID_PROVIDER_CONFIG")
            errors.append({"providerId": config.id, "code": code})
    providers.sort(key=lambda provider: provider.config.priority)
    if not providers:
        logger.warning("llm chain empty; invalid providers=%d", len(errors))
    return ProviderChain(providers, errors)


def payload_version(payload: dict[str, Any] | None) -> str:
    """Cache key for a provider payload.

    The digest always covers the whole payload, so two payloads that share a
    `configVersion` but differ in `baseUrl`/`model`/`apiKey` can never collide.
    `configVersion` is kept as a readable prefix only.
    """
    digest = hashlib.sha1(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()
    version = payload.get("configVersion") if isinstance(payload, dict) else None
    if version is not None:
        return f"v{version}-h{digest[:16]}"
    return f"h{digest[:16]}"


class ProviderChain:
    def __init__(self, providers: list[LLMProvider], build_errors: list[dict[str, str]] | None = None):
        self._providers = list(providers)
        self.build_errors = list(build_errors or [])

    @property
    def provider_ids(self) -> list[str]:
        return [provider.name for provider in self._providers]

    def __bool__(self) -> bool:
        return bool(self._providers)

    def complete(
        self,
        messages: list[ChatMessage],
        opts: CompletionOptions | None = None,
    ) -> CompletionResult:
        return self._run("complete", self._providers, messages, opts)

    def embed(self, texts: list[str], opts: dict | None = None) -> EmbeddingResult:
        return self._run("embed", self._providers, texts, opts)

    def _run(self, op: str, providers: list[LLMProvider], payload: Any, opts: Any):
        errors: list[dict[str, str]] = list(self.build_errors)
        if not providers:
            raise LLMUnavailable(errors)
        for provider in providers:
            started = time.monotonic()
            try:
                if op == "complete":
                    result = provider.complete(payload, opts)
                else:
                    result = provider.embed(payload, opts)
            except ProviderError as exc:
                elapsed = (time.monotonic() - started) * 1000
                logger.info(
                    "llm provider=%s op=%s ok=false code=%s latency_ms=%.0f",
                    provider.name,
                    op,
                    exc.code,
                    elapsed,
                )
                errors.append({"providerId": provider.name, "code": exc.code})
                continue
            elapsed = (time.monotonic() - started) * 1000
            logger.info(
                "llm provider=%s op=%s ok=true latency_ms=%.0f tokens_in=%s tokens_out=%s",
                provider.name,
                op,
                elapsed,
                getattr(result, "tokens_in", 0),
                getattr(result, "tokens_out", 0),
            )
            return result
        raise LLMUnavailable(errors)


class ProviderChainCache:
    """Per-configVersion cache with TTL, used so key material stays short-lived."""

    def __init__(self, ttl_seconds: float | None = None, max_versions: int | None = None) -> None:
        self._ttl = settings.provider_cache_ttl_seconds if ttl_seconds is None else ttl_seconds
        self._max_versions = settings.provider_cache_max_versions if max_versions is None else max_versions
        self._entries: dict[str, tuple[float, ProviderChain]] = {}
        self._lock = threading.Lock()
        self.builds = 0

    def get(self, payload: dict[str, Any] | None) -> ProviderChain:
        if not payload:
            return ProviderChain([])
        key = payload_version(payload)
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None and entry[0] > now:
                return entry[1]
            chain = build_chain(payload)
            self.builds += 1
            self._entries[key] = (now + self._ttl, chain)
            while len(self._entries) > self._max_versions:
                oldest = min(self._entries, key=lambda item: self._entries[item][0])
                if oldest == key:
                    break
                del self._entries[oldest]
            return chain

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


provider_cache = ProviderChainCache()
