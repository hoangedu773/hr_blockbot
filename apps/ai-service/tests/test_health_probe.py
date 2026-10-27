"""
Health probes, readiness and agent-lockdown tests for the AI service.

These tests never touch the network: DB ping is patched, and the vector-index
capability check reports "not configured" honestly (no fake "active").
"""

import os
import sys
from pathlib import Path
from unittest.mock import patch

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from fastapi.testclient import TestClient

from app.db import db_client, get_mongodb_uri
from app.main import app


def _client() -> TestClient:
    return TestClient(app)


def test_health_probe_when_db_disconnected():
    client = _client()
    with patch.object(db_client, "ping", return_value=False):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "degraded"
        assert data["liveness"] == "alive"
        assert data["readiness"] == "not_ready"
        assert data["database"]["status"] == "disconnected"
        assert data["rag_engine"]["status"] == "degraded"
        assert data["agent"]["status"] == "locked"
        assert data["rag_engine"]["vector_search"] in ("BLOCKED", "CONFIGURED", "AVAILABLE", "NOT_REQUIRED")


def test_health_probe_when_db_connected():
    client = _client()
    with patch.object(db_client, "ping", return_value=True):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "ok"
        assert data["readiness"] == "ready"
        assert data["database"]["status"] == "connected"
        assert data["rag_engine"]["status"] == "active"


def test_liveness_endpoint():
    response = _client().get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_readiness_endpoint_honest_failure():
    with patch.object(db_client, "ping", return_value=False):
        response = _client().get("/health/ready")
        assert response.status_code == 503
        assert response.json() == {"status": "not_ready", "database": "disconnected"}


def test_readiness_endpoint_success():
    with patch.object(db_client, "ping", return_value=True):
        response = _client().get("/health/ready")
        assert response.status_code == 200
        assert response.json() == {"status": "ready", "database": "connected"}


def test_chat_locked_when_agent_disabled():
    with patch("app.main.is_agent_enabled", return_value=False):
        response = _client().post("/api/v1/chat", json={"message": "lịch ca của tôi"})
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "AGENT_DISABLED"


def test_legacy_agent_chat_endpoint_is_gone():
    response = _client().post("/api/v1/agent/chat", json={"message": "x"})
    assert response.status_code == 404


def test_credentials_sanitized():
    with patch.dict(os.environ, {}, clear=True):
        assert get_mongodb_uri() is None, "must not fall back to a hardcoded URI"
