"""Shared request budget regressions; no sleep or live network."""

import time

import httpx
import pytest

from app.llm.base import ChatMessage, LLMUnavailable, ProviderConfig
from app.llm.chain import ProviderChain
from app.llm.gemini import GeminiProvider
from app.llm.openai_compatible import OpenAICompatibleProvider


def test_deadline_is_clamped_monotonic_and_resets(monkeypatch):
    import app.deadline as deadline
    clock = [100.0]
    monkeypatch.setattr(deadline.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(deadline.time, "time", lambda: 1000.0)
    with deadline.use_deadline(9_000_000):
        assert deadline.remaining_seconds(30) == pytest.approx(15)
        clock[0] += 14
        assert deadline.remaining_seconds(30) == pytest.approx(1)
        with deadline.use_deadline(None):
            assert deadline.remaining_seconds(30) <= 1
        clock[0] += 1
        with pytest.raises(TimeoutError):
            deadline.remaining_seconds(1)
    with deadline.use_deadline(None):
        assert deadline.remaining_seconds(30) == pytest.approx(15)


@pytest.mark.parametrize("bad", [True, 1.5, float("nan"), float("inf"), "123"])
def test_deadline_rejects_non_integer_boundary(bad):
    from app.deadline import use_deadline
    with pytest.raises((TypeError, ValueError)):
        with use_deadline(bad):
            pass


@pytest.mark.parametrize("provider_class,kind", [(GeminiProvider, "gemini"), (OpenAICompatibleProvider, "openai_compatible")])
def test_provider_uses_remaining_budget_without_mutating_shared_config(provider_class, kind):
    from app.deadline import use_deadline
    seen = []
    def handle(request):
        seen.append(request.extensions["timeout"]["read"])
        return httpx.Response(429)
    config = ProviderConfig(id="primary", type=kind, model="m", api_key="synthetic", base_url="https://example.invalid/v1", timeout_ms=30000)
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        original_timeout = client.timeout
        provider = provider_class(config, client=client)
        with use_deadline(int(time.time() * 1000) + 1000):
            with pytest.raises(LLMUnavailable):
                ProviderChain([provider]).complete([ChatMessage("user", "x")])
        assert 0 < seen[0] <= 1
        assert provider.config is config
        assert provider.config.timeout_ms == 30000
        assert client.timeout == original_timeout


def test_expired_deadline_stops_before_provider_transport():
    from app.deadline import use_deadline
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(429)
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        provider = GeminiProvider(ProviderConfig(id="key-a", type="gemini", model="m", api_key="synthetic"), client=client)
        with use_deadline(int(time.time() * 1000) - 1):
            with pytest.raises(LLMUnavailable) as error:
                ProviderChain([provider]).complete([ChatMessage("user", "x")])
        assert not calls
        assert error.value.errors == [{"providerId": "key-a", "code": "LLM_TIMEOUT"}]


def test_chain_reserves_distinct_model_time_and_skips_expired_attempts(monkeypatch):
    import app.deadline as deadline
    from app.llm.base import CompletionResult, ProviderRateLimited
    from app.llm.fake import FakeProvider
    clock = [100.0]
    monkeypatch.setattr(deadline.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(deadline.time, "time", lambda: 1000.0 + clock[0] - 100.0)
    calls = []
    class Probe(FakeProvider):
        def __init__(self, name, model):
            super().__init__()
            self.config = ProviderConfig(id=name, type="fake", model=model)
        def complete(self, messages, opts=None):
            calls.append((self.name, deadline.remaining_seconds(30)))
            if self.config.model == "fallback":
                clock[0] += 1
                return CompletionResult(text="ok", model=self.config.model, provider_id=self.name)
            clock[0] += 8
            raise ProviderRateLimited(provider_id=self.name)
    providers = [Probe(f"key-{i}", "primary") for i in range(10)] + [Probe("fallback", "fallback")]
    with deadline.use_deadline(None):
        result = ProviderChain(providers).complete([ChatMessage("user", "x")])
    assert result.provider_id == "fallback"
    assert [name for name, _ in calls] == ["key-0", "fallback"]
    assert calls[0][1] == pytest.approx(7.5)
    assert calls[1][1] == pytest.approx(7.0)


def test_fast_rate_limits_can_rotate_all_configured_keys():
    from app.llm.base import CompletionResult, ProviderRateLimited
    from app.llm.fake import FakeProvider
    calls = []
    class Probe(FakeProvider):
        def complete(self, messages, opts=None):
            calls.append(self.name)
            if self.name == "key-9":
                return CompletionResult(text="ok", model="m", provider_id=self.name)
            raise ProviderRateLimited(provider_id=self.name)
    chain = ProviderChain([Probe(ProviderConfig(id=f"key-{i}", type="fake", model="m")) for i in range(10)])
    assert chain.complete([ChatMessage("user", "x")]).provider_id == "key-9"
    assert len(calls) == 10


def test_late_success_is_rejected(monkeypatch):
    import app.deadline as deadline
    clock = [100.0]
    monkeypatch.setattr(deadline.time, "monotonic", lambda: clock[0])
    def handle(request):
        clock[0] += 16
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "late"}]}}]})
    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        provider = GeminiProvider(ProviderConfig(id="slow", type="gemini", model="m", api_key="synthetic"), client=client)
        with deadline.use_deadline(None), pytest.raises(LLMUnavailable) as error:
            ProviderChain([provider]).complete([ChatMessage("user", "x")])
    assert error.value.errors == [{"providerId": "slow", "code": "LLM_TIMEOUT"}]


def test_provider_chain_preserves_configured_priority_order():
    from app.llm.base import CompletionResult, ProviderRateLimited
    from app.llm.fake import FakeProvider
    calls = []
    class Probe(FakeProvider):
        def complete(self, messages, opts=None):
            calls.append(self.name)
            if self.name == "key-a2":
                return CompletionResult(text="ok", model="m", provider_id=self.name)
            raise ProviderRateLimited(provider_id=self.name)
    chain = ProviderChain([
        Probe(ProviderConfig(id="key-a1", type="fake", model="model-a")),
        Probe(ProviderConfig(id="key-b1", type="fake", model="model-b")),
        Probe(ProviderConfig(id="key-a2", type="fake", model="model-a")),
    ])
    result = chain.complete([ChatMessage("user", "x")])
    assert result.provider_id == "key-a2"
    assert calls == ["key-a1", "key-b1", "key-a2"]
