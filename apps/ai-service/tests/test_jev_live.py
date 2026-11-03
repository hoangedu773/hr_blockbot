from __future__ import annotations

import json
import os
from unittest.mock import patch

import httpx
from httpx import Client as HttpxClient

from app.jev_live import analyze_live


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
    with patch("app.jev_live.httpx.Client", lambda **kwargs: HttpxClient(transport=transport, **kwargs)):
        result = analyze_live("quy định đồng phục")

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
    with patch("app.jev_live.httpx.Client") as client:
        result = analyze_live("quy định đồng phục")
    assert result == {"mode": "LIVE", "status": "external_text_disabled", "execution": "none", "source": None}
    client.assert_not_called()
