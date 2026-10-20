"""Provider layer tests (ADR-012 / ADR-017).

All HTTP calls go through httpx.MockTransport: no network, no API key needed.
"""

from __future__ import annotations

import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import httpx
import pytest

from app.llm.base import (
    ChatMessage,
    CompletionOptions,
    LLMProvider,
    LLMUnavailable,
    ProviderConfig,
    ProviderError,
    ProviderRateLimited,
    ProviderTimeout,
    ToolDeclaration,
)
from app.llm.chain import ProviderChain, ProviderChainCache, build_chain
from app.llm.fake import FakeProvider, hashing_embed
from app.llm.gemini import GeminiProvider
from app.llm.openai_compatible import OpenAICompatibleProvider


def _client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_fake_provider_embeddings_are_deterministic_and_normalised():
    provider = FakeProvider(dim=384)
    first = provider.embed(["Chu kỳ tính lương hàng tháng"])
    second = provider.embed(["Chu kỳ tính lương hàng tháng"])

    assert first.model == "fake-hashing-embedder"
    assert first.vectors == second.vectors
    assert len(first.vectors[0]) == 384
    norm = sum(value * value for value in first.vectors[0]) ** 0.5
    assert norm == pytest.approx(1.0, abs=1e-6)


def test_fake_provider_answers_with_citations_from_evidence():
    provider = FakeProvider()
    messages = [
        ChatMessage("system", "system"),
        ChatMessage(
            "user",
            "Bằng chứng:\n[1] QC Chấm Công (v2.1) - Điều 1: chu kỳ tính lương\n\nCâu hỏi: chu kỳ lương?",
        ),
    ]
    result = provider.complete(messages)

    assert "[1]" in result.text
    assert result.provider_id == "fake"


def test_hashing_embed_similar_text_scores_higher_than_unrelated():
    query = hashing_embed("chu kỳ tính lương", 384)
    related = hashing_embed("chu kỳ chấm công và tính lương hàng tháng", 384)
    unrelated = hashing_embed("bay lên trạm không gian quốc tế", 384)

    def cosine(a, b):
        return sum(x * y for x, y in zip(a, b))

    assert cosine(query, related) > cosine(query, unrelated)


def test_openai_compatible_completion_parsing_and_wire_format():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = request.read().decode("utf-8")
        return httpx.Response(
            200,
            json={
                "model": "test-model",
                "choices": [{"message": {"content": "Trả lời [1]"}}],
                "usage": {"prompt_tokens": 11, "completion_tokens": 7},
            },
        )

    provider = OpenAICompatibleProvider(
        ProviderConfig(
            id="openai-1",
            type="openai_compatible",
            model="test-model",
            base_url="https://api.example.com/v1",
            api_key="sk-secret-value",
        ),
        client=_client(handler),
    )
    result = provider.complete(
        [ChatMessage("user", "câu hỏi")],
        CompletionOptions(
            temperature=0.0,
            tools=[ToolDeclaration(name="get_my_kpi", description="KPI", parameters={"type": "object"})],
        ),
    )

    assert captured["path"] == "/v1/chat/completions"
    assert captured["auth"] == "Bearer sk-secret-value"
    assert "get_my_kpi" in captured["body"]
    assert result.text == "Trả lời [1]"
    assert result.tokens_in == 11 and result.tokens_out == 7
    assert result.provider_id == "openai-1"


def test_openai_compatible_embeddings_parsing():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/embeddings"
        return httpx.Response(
            200,
            json={"model": "embed-model", "data": [{"embedding": [0.1, 0.2]}, {"embedding": [0.3, 0.4]}],
                  "usage": {"prompt_tokens": 5}},
        )

    provider = OpenAICompatibleProvider(
        ProviderConfig(
            id="embed-1",
            type="openai_compatible",
            model="embed-model",
            base_url="https://api.example.com/v1/",
            api_key="k",
        ),
        client=_client(handler),
    )
    result = provider.embed(["a", "b"])

    assert result.vectors == [[0.1, 0.2], [0.3, 0.4]]
    assert result.model == "embed-model"


def test_openai_compatible_rate_limit_and_timeout_are_typed_errors():
    rate_limited = OpenAICompatibleProvider(
        ProviderConfig(id="rl", type="openai_compatible", model="m", base_url="https://x/v1", api_key="k"),
        client=_client(lambda request: httpx.Response(429, json={"error": "quota"})),
    )
    with pytest.raises(ProviderRateLimited):
        rate_limited.complete([ChatMessage("user", "x")])

    def raise_timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    timed_out = OpenAICompatibleProvider(
        ProviderConfig(id="to", type="openai_compatible", model="m", base_url="https://x/v1", api_key="k"),
        client=_client(raise_timeout),
    )
    with pytest.raises(ProviderTimeout):
        timed_out.complete([ChatMessage("user", "x")])


def test_openai_compatible_http_error_body_is_not_leaked():
    provider = OpenAICompatibleProvider(
        ProviderConfig(id="err", type="openai_compatible", model="m", base_url="https://x/v1", api_key="k"),
        client=_client(lambda request: httpx.Response(500, text="secret prompt content")),
    )
    with pytest.raises(ProviderError) as excinfo:
        provider.complete([ChatMessage("user", "x")])
    assert "secret prompt content" not in str(excinfo.value)


def test_gemini_completion_and_function_call_parsing():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["key_header"] = request.headers.get("x-goog-api-key")
        captured["query_has_key"] = "key=" in request.url.query.decode()
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": "Kết quả "},
                                {"functionCall": {"name": "search_policy", "args": {"query": "lương"}}},
                            ]
                        }
                    }
                ],
                "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 4},
            },
        )

    provider = GeminiProvider(
        ProviderConfig(id="gemini-1", type="gemini", model="gemini-test", api_key="g-key"),
        client=_client(handler),
    )
    result = provider.complete([ChatMessage("system", "sys"), ChatMessage("user", "câu hỏi")])

    assert captured["path"].endswith("/models/gemini-test:generateContent")
    assert captured["key_header"] == "g-key"
    assert captured["query_has_key"] is False
    assert result.text == "Kết quả "
    assert result.tool_calls[0].name == "search_policy"
    assert result.tool_calls[0].arguments == {"query": "lương"}


def test_gemini_embedding_batch_parsing():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith(":batchEmbedContents")
        return httpx.Response(200, json={"embeddings": [{"values": [0.5, 0.25]}]})

    provider = GeminiProvider(
        ProviderConfig(id="gemini-embed", type="gemini", model="embed-test", api_key="g"),
        client=_client(handler),
    )
    result = provider.embed(["một câu"])
    assert result.vectors == [[0.5, 0.25]]


class _AlwaysFails(LLMProvider):
    def __init__(self, name: str, code: str = "QUOTA_EXCEEDED"):
        super().__init__(ProviderConfig(id=name, type="fake", model="m"))
        self.code = code

    def complete(self, messages, opts=None):
        raise ProviderRateLimited("nope", provider_id=self.name)

    def embed(self, texts, opts=None):
        raise ProviderRateLimited("nope", provider_id=self.name)


def test_provider_chain_falls_back_to_next_priority():
    chain = ProviderChain([_AlwaysFails("primary"), FakeProvider()])
    result = chain.complete([ChatMessage("user", "xin chào")])
    assert result.provider_id == "fake"


def test_provider_chain_raises_unavailable_when_all_fail():
    chain = ProviderChain([_AlwaysFails("a"), _AlwaysFails("b")])
    with pytest.raises(LLMUnavailable) as excinfo:
        chain.complete([ChatMessage("user", "x")])
    assert [error["providerId"] for error in excinfo.value.errors] == ["a", "b"]


def test_provider_chain_empty_raises_unavailable():
    with pytest.raises(LLMUnavailable):
        build_chain({"configVersion": 1, "providers": []}).complete([ChatMessage("user", "x")])


def test_build_chain_skips_disabled_and_sorts_by_priority():
    chain = build_chain(
        {
            "configVersion": 2,
            "providers": [
                {"id": "b", "type": "fake", "model": "m", "priority": 2, "enabled": True},
                {"id": "a", "type": "fake", "model": "m", "priority": 1, "enabled": True},
                {"id": "off", "type": "fake", "model": "m", "priority": 0, "enabled": False},
            ],
        }
    )
    assert chain.provider_ids == ["a", "b"]


def test_provider_cache_uses_config_version_and_respects_ttl():
    cache = ProviderChainCache(ttl_seconds=60)
    payload = {"configVersion": 7, "providers": [{"id": "a", "type": "fake", "model": "m"}]}

    first = cache.get(payload)
    second = cache.get(payload)
    assert first is second
    assert cache.builds == 1

    payload_v8 = {"configVersion": 8, "providers": [{"id": "a", "type": "fake", "model": "m"}]}
    cache.get(payload_v8)
    assert cache.builds == 2

    expired = ProviderChainCache(ttl_seconds=0)
    expired.get(payload)
    expired.get(payload)
    assert expired.builds == 2
