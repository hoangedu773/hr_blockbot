from __future__ import annotations

import asyncio
import json
import os
from unittest.mock import patch

import httpx
import pytest

from app.jev_live import analyze_live

_RealAsyncClient = httpx.AsyncClient
def test_live_adapter_is_opt_in_and_validates_typed_response(monkeypatch):
    monkeypatch.setenv("JEV_V1_MODE", "LIVE")
    monkeypatch.setenv("JEV_LIVE_ALLOW_EXTERNAL_TEXT", "true")
    monkeypatch.setenv("JEV_API_KEY", "synthetic-live-key-123456")
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"code": 0, "data": {"result": {"answers": {
            "intent": {"type": "choice", "choice": "policy_query", "confidence": 0.91,
                        "probabilities": {"policy_query": 0.91}},
            "needs_manager_approval": {"type": "noul", "noul": 0.0},
            "incident_urgency": {"type": "score", "score": 0.1},
        }}}})

    transport = httpx.MockTransport(handler)
    with patch("app.jev_live.httpx.AsyncClient", lambda **kwargs: _RealAsyncClient(transport=transport, **kwargs)):
        result = asyncio.run(analyze_live("quy định đồng phục"))
    assert result["status"] == "ok"
    assert result["execution"] == "live"
    assert result["source"] == "jev_systemone"
    assert result["intent"] == "policy_query"
    assert seen["url"] == "https://thejevai.com/v1/systemone"
    assert seen["auth"] == "Bearer synthetic-live-key-123456"
    assert seen["body"]["state"] == "quy định đồng phục"
    assert "delegationToken" not in str(seen["body"])
    assert "employeeId" not in str(seen["body"])


def test_live_adapter_fails_closed_without_explicit_external_text_consent(monkeypatch):
    monkeypatch.setenv("JEV_V1_MODE", "LIVE")
    monkeypatch.setenv("JEV_API_KEY", "synthetic-live-key-123456")
    monkeypatch.delenv("JEV_LIVE_ALLOW_EXTERNAL_TEXT", raising=False)
    with patch("app.jev_live.httpx.AsyncClient") as client:
        result = asyncio.run(analyze_live("quy định đồng phục"))
    assert result == {"mode": "LIVE", "status": "external_text_disabled", "execution": "none", "source": None}
    client.assert_not_called()


@pytest.mark.parametrize("terminal", ["succeeded", "unknown", "unauthorized", "quota", "malformed"])
def test_usejevai_queued_transport_is_pinned_idempotent_and_never_resubmits(monkeypatch, terminal):
    monkeypatch.setenv("JEV_V1_MODE", "LIVE")
    monkeypatch.setenv("JEV_V1_PROVIDER", "usejevai")
    monkeypatch.setenv("JEV_LIVE_ALLOW_EXTERNAL_TEXT", "true")
    monkeypatch.setenv("USEJEVAI_API_KEY", "synthetic-usejevai-key-123456")
    monkeypatch.setenv("JEV_API_KEY", "wrong-key-from-other-provider")
    calls = []
    def handler(request):
        calls.append((request.method, str(request.url)))
        assert request.headers["authorization"] == "Bearer synthetic-usejevai-key-123456"
        if request.method == "POST":
            assert str(request.url) == "https://usejevai.com/api/v1/runs"
            body = json.loads(request.content)
            assert body["funding"] == "prefer_trial"
            assert len(body["idempotencyKey"]) == 32
            assert body["input"]["state"] == "Synthetic connectivity only"
            assert [q["id"] for q in body["input"]["questions"]] == ["intent", "needs_manager_approval", "incident_urgency"]
            assert all("options" in q for q in body["input"]["questions"])
            assert "providerConfig" not in str(body) and "delegationToken" not in str(body)
            return httpx.Response(202, json={"code": 0, "data": {"id": "run-synthetic"}})
        assert str(request.url) == "https://usejevai.com/api/v1/runs/run-synthetic"
        if terminal in ("unauthorized", "quota"):
            return httpx.Response(401 if terminal == "unauthorized" else 402, json={"code": -1})
        if terminal == "unknown":
            return httpx.Response(200, json={"code": 0, "data": {"status": "unknown"}})
        if len(calls) == 2:
            return httpx.Response(200, json={"code": 0, "data": {"status": "queued"}})
        answers = {
            "intent": {"type": "choice", "choice": "general_chat", "confidence": 0.9, "probabilities": {"general_chat": 0.9}},
            "needs_manager_approval": {"type": "noul", "noul": 0.1},
            "incident_urgency": {"type": "score", "score": "not-numeric" if terminal == "malformed" else 0.0},
        }
        return httpx.Response(200, json={"code": 0, "data": {"status": "succeeded", "result": {"response": {"answers": answers}}}})
    async def no_sleep(_sec):
        return None
    with patch("app.jev_live.httpx.AsyncClient", lambda **kwargs: _RealAsyncClient(transport=httpx.MockTransport(handler), **kwargs)), patch("app.jev_live.asyncio.sleep", no_sleep):
        result = asyncio.run(analyze_live("Synthetic connectivity only"))
    assert result["status"] == ("ok" if terminal == "succeeded" else "unavailable")
    assert result["source"] == ("jev_usejevai" if terminal == "succeeded" else None)
