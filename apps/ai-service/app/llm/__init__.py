"""LLM provider abstraction (ADR-012) with runtime settings (ADR-017)."""

from app.llm.base import (
    ChatMessage,
    CompletionOptions,
    CompletionResult,
    EmbeddingResult,
    LLMProvider,
    LLMUnavailable,
    ProviderConfig,
    ProviderError,
    ProviderInvalidConfig,
    ProviderRateLimited,
    ProviderTimeout,
    ToolCall,
    ToolDeclaration,
)
from app.llm.chain import ProviderChain, ProviderChainCache, build_chain, build_provider, provider_cache
from app.llm.fake import FakeProvider, hashing_embed
from app.llm.gemini import GeminiProvider
from app.llm.openai_compatible import OpenAICompatibleProvider

__all__ = [
    "ChatMessage",
    "CompletionOptions",
    "CompletionResult",
    "EmbeddingResult",
    "FakeProvider",
    "GeminiProvider",
    "LLMProvider",
    "LLMUnavailable",
    "OpenAICompatibleProvider",
    "ProviderChain",
    "ProviderChainCache",
    "ProviderConfig",
    "ProviderError",
    "ProviderInvalidConfig",
    "ProviderRateLimited",
    "ProviderTimeout",
    "ToolCall",
    "ToolDeclaration",
    "build_chain",
    "build_provider",
    "hashing_embed",
    "provider_cache",
]
