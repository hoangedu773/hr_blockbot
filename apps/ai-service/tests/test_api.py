"""API boundary tests: auth, fail-closed, degraded mode, chat happy path."""

from __future__ import annotations

import dataclasses
import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.config import settings
from app.main import app
from tests.fakes import FakeCollection, FakeDb


@pytest.fixture
def client(monkeypatch) -> TestClient:
    monkeypatch.setattr(main_module, "settings", dataclasses.replace(settings, ai_service_api_key="synthetic-service-key"))
    return TestClient(app, headers={"x-ai-service-key": "synthetic-service-key"})


@pytest.fixture(autouse=True)
def _reset_cache():
    from app.agent.loop import QUERY_CACHE
    main_module.provider_cache.clear()
    QUERY_CACHE.clear()
    yield
    main_module.provider_cache.clear()
    QUERY_CACHE.clear()


FAKE_PROVIDER_CONFIG = {
    "configVersion": 1,
    "providers": [{"id": "fake", "type": "fake", "model": "fake-hashing-embedder", "priority": 1}],
}


def _enable_agent(monkeypatch):
    monkeypatch.setattr(main_module, "is_agent_enabled", lambda: True)
    # ToolRuntime also checks the switch via its own module reference.
    monkeypatch.setattr("app.agent.tools.is_agent_enabled", lambda: True)


def test_health_reports_degraded_without_db(client, monkeypatch):
    monkeypatch.setattr(main_module.db_client, "ping", lambda: False)
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["readiness"] == "not_ready"
    assert payload["database"]["status"] == "disconnected"
    assert payload["rag_engine"]["status"] == "degraded"
    assert payload["agent"]["agent_enabled"] is False


def test_health_reports_ok_with_db(client, monkeypatch):
    monkeypatch.setattr(main_module.db_client, "ping", lambda: True)
    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["readiness"] == "ready"
    assert payload["rag_engine"]["status"] == "active"


def test_readiness_returns_503_when_db_down(client, monkeypatch):
    monkeypatch.setattr(main_module.db_client, "ping", lambda: False)
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"


def test_chat_locked_when_agent_disabled(client, monkeypatch):
    monkeypatch.setattr(main_module, "is_agent_enabled", lambda: False)
    response = client.post("/api/v1/chat", json={"message": "hồ sơ của tôi"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "AGENT_DISABLED"


def test_chat_fails_closed_without_provider_config(client, monkeypatch):
    _enable_agent(monkeypatch)
    response = client.post("/api/v1/chat", json={"message": "Chu kỳ tính lương?"})

    assert response.status_code == 503
    payload = response.json()
    assert payload["error"]["code"] == "LLM_UNAVAILABLE"
    assert payload["degraded"] == "degraded-structured"


def test_chat_greeting_succeeds_even_when_chain_has_no_provider(client, monkeypatch):
    _enable_agent(monkeypatch)
    response = client.post(
        "/api/v1/chat",
        json={"message": "hi", "providerConfig": {"configVersion": 1, "providers": []}},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["intent"] == "general_chat"
    assert "trợ lý" in payload["reply"].lower()
    assert payload["abstain"] is False

def test_chat_policy_path_with_mock_provider(client, monkeypatch):
    _enable_agent(monkeypatch)
    monkeypatch.setattr(main_module.db_client, "ping", lambda: False)
    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Chu kỳ tính lương chốt bảng công ngày nào?",
            "userContext": {"employeeId": "651111111111111111111111", "role": "Employee"},
            "providerConfig": FAKE_PROVIDER_CONFIG,
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["tool"] == "search_policy"
    assert payload["abstain"] is False
    assert payload["citations"]
    assert payload["steps"] == 1


def test_chat_returns_503_when_all_providers_invalid(client, monkeypatch):
    _enable_agent(monkeypatch)
    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Chu kỳ tính lương?",
            "userContext": {"role": "Employee"},
            # openai_compatible without baseUrl is an invalid config -> chain empty
            "providerConfig": {"configVersion": 9, "providers": [{"id": "x", "type": "openai_compatible", "model": "m"}]},
        },
    )

    assert response.status_code == 503
    payload = response.json()
    assert payload["error"]["code"] == "LLM_UNAVAILABLE"


def test_chat_tool_path_with_fake_db(client, monkeypatch):
    _enable_agent(monkeypatch)
    db = FakeDb()
    db.employees.find_one_result = {
        "_id": "651111111111111111111111",
        "employeeCode": "GT-001",
        "fullName": "Nguyễn Văn A",
        "level": "Junior",
        "departmentId": None,
        "skills": ["Python"],
        "status": "active",
    }
    monkeypatch.setattr(main_module.db_client, "db", db)
    monkeypatch.setattr(main_module.db_client, "ping", lambda: True)
    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Xem hồ sơ của tôi",
            "userContext": {"employeeId": "651111111111111111111111", "role": "Employee"},
            "providerConfig": FAKE_PROVIDER_CONFIG,
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["tool"] == "get_my_profile"
    assert "Nguyễn Văn A" in payload["reply"]


def test_rag_query_without_provider_is_degraded(client, monkeypatch):
    monkeypatch.setattr(main_module.db_client, "ping", lambda: False)
    response = client.post(
        "/api/v1/rag/query",
        json={"question": "Chu kỳ tính lương chốt bảng công ngày nào?", "retriever": "lexical"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["degraded"] is True
    assert payload["citations"]
    assert payload["retrieval"]["retriever"] == "lexical"


def test_rag_query_abstains_out_of_scope(client, monkeypatch):
    monkeypatch.setattr(main_module.db_client, "ping", lambda: False)
    response = client.post(
        "/api/v1/rag/query",
        json={
            "question": "Thời gian bay của tàu con thoi lên trạm không gian ISS là bao lâu?",
            "retriever": "hybrid",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["abstain"] is True
    assert payload["citations"] == []


def test_service_key_rejects_wrong_key(client, monkeypatch):
    monkeypatch.setattr(main_module, "settings", dataclasses.replace(settings, ai_service_api_key="secret"))
    response = client.post("/api/v1/rag/query", json={"question": "lương"}, headers={"x-ai-service-key": "nope"})
    assert response.status_code == 401


def test_service_key_accepts_correct_key(client, monkeypatch):
    monkeypatch.setattr(main_module, "settings", dataclasses.replace(settings, ai_service_api_key="secret"))
    monkeypatch.setattr(main_module.db_client, "ping", lambda: False)
    response = client.post(
        "/api/v1/rag/query",
        json={"question": "lương"},
        headers={"x-ai-service-key": "secret"},
    )
    assert response.status_code == 200


def test_service_key_fails_closed_when_unconfigured(client, monkeypatch):
    monkeypatch.setattr(main_module, "settings", dataclasses.replace(settings, ai_service_api_key=""))
    response = client.post("/api/v1/chat", json={"message": "test"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "SERVICE_KEY_NOT_CONFIGURED"


@pytest.mark.parametrize("deadline", [True, 1.5, "123"])
def test_chat_rejects_non_integer_deadline(client, monkeypatch, deadline):
    _enable_agent(monkeypatch)
    response = client.post("/api/v1/chat", json={
        "message": "Deadline validation", "deadlineAtMs": deadline,
        "providerConfig": FAKE_PROVIDER_CONFIG,
    })
    assert response.status_code == 422


def test_chat_expired_deadline_returns_provider_timeout(client, monkeypatch):
    _enable_agent(monkeypatch)
    response = client.post("/api/v1/chat", json={
        "message": "Chu kỳ tính lương?", "deadlineAtMs": 0,
        "providerConfig": FAKE_PROVIDER_CONFIG,
    })
    assert response.status_code == 503
    assert response.json()["error"]["providers"] == [{"providerId": "fake", "code": "LLM_TIMEOUT"}]


def test_chat_handler_establishes_default_and_clamped_deadline(client, monkeypatch):
    from app.agent.loop import AgentTurn
    seen = []
    def run(self, message, user_ctx):
        from app.deadline import remaining_seconds
        seen.append(remaining_seconds(30))
        return AgentTurn(intent="general_chat", intent_id="general_chat", reply="ok")
    _enable_agent(monkeypatch)
    monkeypatch.setattr(main_module.AgentLoop, "run", run)
    for extra in ({}, {"deadlineAtMs": 9_000_000_000_000}):
        response = client.post("/api/v1/chat", json={
            "message": "Deadline context", "providerConfig": FAKE_PROVIDER_CONFIG, **extra,
        })
        assert response.status_code == 200
    assert all(0 < seconds <= 15 for seconds in seen)
