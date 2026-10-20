"""LLMProvider abstraction — ADR-012.

Business logic never imports a vendor SDK or a vendor URL: it calls one of the
implementations below through `LLMProvider`. Each adapter translates the same
provider-agnostic tool declaration into the vendor wire format.

Hard rules:
- Never log prompt/message content (may contain PII). Log only provider id, latency
  and token counts.
- A quota/timeout error is a *valid outcome*, not a crash: callers decide between
  fallback and `degraded-structured` (docs/08-algorithms.md §6.3).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass(frozen=True)
class ChatMessage:
    role: Literal["system", "user", "assistant", "tool"]
    content: str


@dataclass(frozen=True)
class ToolDeclaration:
    """Provider-agnostic tool declaration (JSON Schema for the arguments)."""

    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict[str, Any]


@dataclass
class CompletionOptions:
    temperature: float = 0.0
    max_tokens: int | None = None
    tools: list[ToolDeclaration] | None = None


@dataclass
class CompletionResult:
    text: str
    model: str
    provider_id: str
    tokens_in: int = 0
    tokens_out: int = 0
    tool_calls: list[ToolCall] = field(default_factory=list)


@dataclass
class EmbeddingResult:
    vectors: list[list[float]]
    model: str
    provider_id: str
    tokens_in: int = 0


@dataclass(frozen=True)
class ProviderConfig:
    """Runtime provider settings coming from `apps/api` (ADR-017).

    `api_key` is decrypted by `apps/api` and passed per request; it is never logged
    and never persisted here.
    """

    id: str
    type: str  # openai_compatible | gemini | fake
    model: str
    base_url: str | None = None
    api_key: str | None = None
    max_tokens: int = 512
    timeout_ms: int = 20000
    priority: int = 1
    enabled: bool = True

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "ProviderConfig":
        return cls(
            id=str(payload.get("id") or "unknown"),
            type=str(payload.get("type") or "openai_compatible"),
            model=str(payload.get("model") or ""),
            base_url=(payload.get("baseUrl") or payload.get("base_url") or None),
            api_key=(payload.get("apiKey") or payload.get("api_key") or None),
            max_tokens=int(payload.get("maxTokens") or payload.get("max_tokens") or 512),
            timeout_ms=int(payload.get("timeoutMs") or payload.get("timeout_ms") or 20000),
            priority=int(payload.get("priority") or 1),
            enabled=bool(payload.get("enabled", True)),
        )


class ProviderError(Exception):
    """A provider call failed but the chain may try the next provider."""

    code = "PROVIDER_ERROR"
    retryable = True

    def __init__(self, message: str = "", *, provider_id: str = "") -> None:
        super().__init__(message)
        self.provider_id = provider_id


class ProviderTimeout(ProviderError):
    code = "LLM_TIMEOUT"


class ProviderRateLimited(ProviderError):
    code = "QUOTA_EXCEEDED"


class ProviderInvalidConfig(ProviderError):
    code = "INVALID_PROVIDER_CONFIG"
    retryable = False


class LLMUnavailable(Exception):
    """No provider in the chain could answer (config invalid count = 0)."""

    code = "LLM_UNAVAILABLE"

    def __init__(self, errors: list[dict[str, str]] | None = None) -> None:
        super().__init__("No LLM provider available")
        self.errors = errors or []


class LLMProvider(ABC):
    """ADR-012 interface: complete(messages, opts) + embed(texts, opts)."""

    def __init__(self, config: ProviderConfig) -> None:
        self.config = config

    @property
    def name(self) -> str:
        return self.config.id

    @property
    def timeout(self) -> float:
        return max(self.config.timeout_ms / 1000.0, 0.1)

    @abstractmethod
    def complete(
        self,
        messages: list[ChatMessage],
        opts: CompletionOptions | None = None,
    ) -> CompletionResult:
        """Return one completion; raise ProviderError subclasses on failure."""

    @abstractmethod
    def embed(self, texts: list[str], opts: dict[str, Any] | None = None) -> EmbeddingResult:
        """Return one vector per input text; raise ProviderError subclasses on failure."""
