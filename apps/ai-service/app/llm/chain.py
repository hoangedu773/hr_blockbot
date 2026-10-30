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

# "Key cabinet" cooldown registry — MODULE-LEVEL on purpose: the chat path builds
# a fresh ProviderChain per request (main.py), so per-instance state would reset
# every turn and exhausted keys would be retried from scratch each time. Keyed by
# (provider id, last-4 of key) — no key material is stored in memory here.
_PROVIDER_COOLDOWN_SECONDS = {
    "QUOTA_EXCEEDED": 90.0,  # key vừa đốt hạn mức phút — ủ ~1.5 phút
    "LLM_TIMEOUT": 30.0,     # key treo — ủ ngắn hơn
}
_provider_cooldowns: dict[tuple[str, str], float] = {}


def _cooldown_key(provider: LLMProvider) -> tuple[str, str]:
    return (provider.config.id, (provider.config.api_key or "")[-4:])
from typing import Any

from app.config import settings
from app.deadline import remaining_seconds, use_deadline
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
        self.config_version: Any = None

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
        with use_deadline(None):
            return self._run_with_deadline("complete", self._providers, messages, opts)

    def embed(self, texts: list[str], opts: dict | None = None) -> EmbeddingResult:
        with use_deadline(None):
            return self._run_with_deadline("embed", self._providers, texts, opts)

    def _run_with_deadline(self, op: str, providers: list[LLMProvider], payload: Any, opts: Any):
        errors: list[dict[str, str]] = list(self.build_errors)
        if not providers:
            raise LLMUnavailable(errors)
        group_expiry = 0.0
        previous_group = None
        now = time.monotonic()
        available = [
            (index, provider)
            for index, provider in enumerate(providers)
            if _provider_cooldowns.get(_cooldown_key(provider), 0) <= now
        ]
        if not available:
            # Every key is parked in the cooldown cabinet. Recycle the one that
            # becomes ready first (best effort) instead of failing instantly —
            # its own error surfaces honestly if the bucket is still drained.
            parked = sorted(
                ((index, provider) for index, provider in enumerate(providers)),
                key=lambda ip: _provider_cooldowns.get(_cooldown_key(ip[1]), 0),
            )
            available = parked[:1]
        for position, (index, provider) in enumerate(available):
            config = provider.config
            group = (config.type, config.model, config.base_url)
            started = time.monotonic()
            try:
                remaining = remaining_seconds(15.0)
                if group != previous_group:
                    remaining_models = max(
                        1,
                        len({(p.config.type, p.config.model, p.config.base_url) for _, p in available[position:]}),
                    )
                    group_expiry = time.monotonic() + remaining / remaining_models
                    previous_group = group
                budget = min(provider.timeout, max(0.0, group_expiry - time.monotonic()))
                if budget <= 0:
                    continue
                with use_deadline(int(time.time() * 1000 + budget * 1000)):
                    if op == "complete":
                        result = provider.complete(payload, opts)
                    else:
                        result = provider.embed(payload, opts)
                    remaining_seconds(provider.timeout)
            except (ProviderError, TimeoutError) as exc:
                elapsed = (time.monotonic() - started) * 1000
                logger.info(
                    "llm provider=%s op=%s ok=false code=%s latency_ms=%.0f",
                    provider.name,
                    op,
                    getattr(exc, "code", "LLM_TIMEOUT"),
                    elapsed,
                )
                code = getattr(exc, "code", "LLM_TIMEOUT")
                if code not in {"PROVIDER_ERROR", "LLM_TIMEOUT", "QUOTA_EXCEEDED", "INVALID_PROVIDER_CONFIG"}:
                    code = "PROVIDER_ERROR"
                errors.append({"providerId": provider.name, "code": code})
                # "Key cabinet" rotation (user-specified model): a key that just
                # burned its quota (or hung) is parked for a cool-down window and
                # skipped instantly by the following requests, so the chain stops
                # paying 0.5s x dead keys + 9s x hung keys on every single turn.
                if code in _PROVIDER_COOLDOWN_SECONDS:
                    _provider_cooldowns[_cooldown_key(provider)] = (
                        time.monotonic() + _PROVIDER_COOLDOWN_SECONDS[code]
                    )
                try:
                    remaining_seconds(provider.timeout)
                except TimeoutError:
                    break
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
            if isinstance(result, CompletionResult):
                result.provider_errors = errors + result.provider_errors
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
            chain.config_version = payload.get("configVersion")
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
