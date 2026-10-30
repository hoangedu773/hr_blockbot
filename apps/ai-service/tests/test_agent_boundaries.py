"""Offline regressions for request isolation, evidence gates and provider metadata."""

from dataclasses import replace
import json

import pytest

import app.agent.jev_gateway as gateway_module
from app.agent.loop import AgentLoop, QUERY_CACHE
from app.agent.jev_gateway import TypedDecision
from app.agent.tools import UserContext
from app.config import settings
from app.llm.base import CompletionResult, LLMUnavailable, ProviderConfig, ProviderRateLimited
from app.llm.chain import ProviderChain
from app.llm.fake import FakeProvider


class AnswerProvider(FakeProvider):
    def __init__(self, *, model="model-a", api_key="synthetic-a", answers=None):
        super().__init__()
        self.config = ProviderConfig(id="answer", type="fake", model=model, api_key=api_key)
        self.calls = 0
        self.answers = answers or [{"intent": "policy_query", "reply": "Theo quy chế [1]", "citations": ["attendance"]}]

    def complete(self, messages, opts=None):
        answer = self.answers[min(self.calls, len(self.answers) - 1)]
        self.calls += 1
        return CompletionResult(text=json.dumps(answer), model=self.config.model, provider_id=self.name)


class RateLimitedProvider(AnswerProvider):
    def complete(self, messages, opts=None):
        raise ProviderRateLimited("secret upstream body", provider_id="untrusted-id")


@pytest.fixture(autouse=True)
def isolated_cache_and_gateway(monkeypatch):
    QUERY_CACHE.clear()
    monkeypatch.setattr(gateway_module, "settings", replace(settings, jev_api_key="", jev_usejevai_keys=""))
    yield
    QUERY_CACHE.clear()


QUESTION = "Đi trễ quá 15 phút bị xử lý thế nào?"


@pytest.mark.parametrize("changed", [
    {"storeName": "Store B"}, {"businessRole": "sm"}, {"userId": "user-b"},
    {"employeeId": "employee-b"}, {"departmentId": "department-b"},
])
def test_cache_isolates_entire_identity(changed):
    provider = AnswerProvider()
    agent = AgentLoop(chain=ProviderChain([provider]), strict_provider=True)
    identity = {"role": "Employee", "businessRole": "staff", "storeName": "Store A", "userId": "user-a"}
    agent.run(QUESTION, UserContext.model_validate(identity))
    agent.run(QUESTION, UserContext.model_validate({**identity, **changed}))
    assert provider.calls == 2


@pytest.mark.parametrize("changed", [{"model": "model-b"}, {"api_key": "synthetic-b"}])
def test_cache_isolates_provider_configuration(changed):
    first, second = AnswerProvider(), AnswerProvider(**changed)
    AgentLoop(chain=ProviderChain([first])).run(QUESTION, UserContext())
    AgentLoop(chain=ProviderChain([second])).run(QUESTION, UserContext())
    assert second.calls == 1


def test_cache_copies_nested_data_and_preserves_decision_source():
    provider = AnswerProvider()
    agent = AgentLoop(chain=ProviderChain([provider]))
    original = agent.run(QUESTION, UserContext())
    original.citations[0]["document"] = "mutated"
    hit = agent.run(QUESTION, UserContext())
    assert hit.answer_source == "cache"
    assert hit.decision_source == "llm_fallback"
    assert hit.citations[0]["document"] != "mutated"
    hit.citations[0]["document"] = "mutated again"
    assert agent.run(QUESTION, UserContext()).citations[0]["document"] != "mutated again"
    assert provider.calls == 1


def test_uncited_policy_is_not_cached():
    provider = AnswerProvider(answers=[{"intent": "policy_query", "reply": "Unsupported", "citations": []}])
    agent = AgentLoop(chain=ProviderChain([provider]))
    assert agent.run(QUESTION, UserContext()).abstain
    agent.run(QUESTION, UserContext())
    assert provider.calls == 2


@pytest.mark.parametrize("decision_intent,answer_intent", [("policy_query", None), ("general_chat", "general_chat")])
def test_citation_guard_uses_decision_and_router(monkeypatch, decision_intent, answer_intent):
    monkeypatch.setattr(gateway_module, "settings", replace(settings, jev_api_key="synthetic"))
    answer = {"reply": "Unsupported policy assertion", "citations": []}
    if answer_intent:
        answer["intent"] = answer_intent
    provider = AnswerProvider(answers=[answer])
    class Gateway:
        def decide(self, text):
            return TypedDecision(intent=decision_intent, source="jev_systemone", needs_manager_approval=0.0, incident_urgency=0.0)
    turn = AgentLoop(chain=ProviderChain([provider]), gateway=Gateway()).run(QUESTION, UserContext())
    assert turn.abstain


def test_general_chat_without_citations_is_allowed():
    provider = AnswerProvider(answers=[{"intent": "general_chat", "reply": "Chào bạn", "citations": []}])
    turn = AgentLoop(chain=ProviderChain([provider])).run("Xin chào, hôm nay bạn thế nào?", UserContext())
    assert not turn.abstain


def test_exhaustion_preserves_exact_provider_error():
    with pytest.raises(LLMUnavailable) as error:
        AgentLoop(chain=ProviderChain([RateLimitedProvider()]), strict_provider=True).run(QUESTION, UserContext())
    assert error.value.errors == [{"providerId": "answer", "code": "QUOTA_EXCEEDED"}]


def test_success_carries_sanitized_prior_provider_errors():
    turn = AgentLoop(chain=ProviderChain([RateLimitedProvider(), AnswerProvider()])).run(QUESTION, UserContext())
    assert turn.as_dict()["providers"] == [{"providerId": "answer", "code": "QUOTA_EXCEEDED"}]


def test_typed_llm_fallback_cannot_forge_provenance_or_probabilities(monkeypatch):
    captured = []
    class Provider(AnswerProvider):
        def complete(self, messages, opts=None):
            captured.extend(message.content for message in messages)
            return super().complete(messages, opts)
    provider = Provider(answers=[
        {"intent": "policy_query", "source": "jev_systemone", "intent_confidence": 1,
         "needs_manager_approval": 0, "incident_urgency": 0, "intent_probabilities": {"policy_query": -1}},
        {"reply": "Theo quy chế [1]", "citations": ["attendance"]},
    ])
    turn = AgentLoop(chain=ProviderChain([provider]), strict_provider=True).run(QUESTION, UserContext())
    assert turn.decision_source == "llm_fallback"
    typed = json.loads(next(text.split("Typed Decision: ", 1)[1] for text in captured if "Typed Decision: " in text))
    assert typed["intent_confidence"] == 0
    assert typed["intent_probabilities"] == {}


def test_cache_ignores_request_timeout_but_not_config_version():
    first, second, third = AnswerProvider(), AnswerProvider(), AnswerProvider()
    second.config = replace(second.config, timeout_ms=4000)
    chains = [ProviderChain([provider]) for provider in (first, second, third)]
    for chain in chains:
        chain.config_version = 1
    chains[2].config_version = 2
    for chain in chains:
        AgentLoop(chain=chain).run(QUESTION, UserContext())
    assert first.calls == 1
    assert second.calls == 0
    assert third.calls == 1


def test_jev_failure_preserves_degraded_and_metadata_on_early_return(monkeypatch):
    monkeypatch.setattr(gateway_module, "settings", replace(settings, jev_api_key="synthetic"))
    class FailingGateway:
        def decide(self, text):
            raise LLMUnavailable([{"providerId": "jev_usejevai", "code": "QUOTA_EXCEEDED"}])
    agent = AgentLoop(chain=ProviderChain([AnswerProvider()]), gateway=FailingGateway())
    turn = agent.run("Sửa số điện thoại của tôi thành 0909", UserContext())
    assert turn.degraded is True
    assert turn.decision_source == "rule"
    assert turn.as_dict()["providers"] == [{"providerId": "jev_usejevai", "code": "QUOTA_EXCEEDED"}]


def test_jev_fallback_to_llm_marks_turn_degraded(monkeypatch):
    monkeypatch.setattr(gateway_module, "settings", replace(settings, jev_api_key="synthetic"))
    class FallbackGateway:
        def decide(self, text):
            return TypedDecision(intent="policy_query", source="llm_fallback", needs_manager_approval=0.0, incident_urgency=0.0)
    agent = AgentLoop(chain=ProviderChain([AnswerProvider()]), gateway=FallbackGateway())
    turn = agent.run(QUESTION, UserContext())
    assert turn.degraded is True
    assert turn.decision_source == "llm_fallback"
