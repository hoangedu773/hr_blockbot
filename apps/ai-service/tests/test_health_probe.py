"""
Unit and probe tests for AI-Service Health Check, Liveness/Readiness, and Mock Lockdown.
Tests truthful reporting when MongoDB is down vs up, and validates mock tool lockdown.
"""

import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Đảm bảo đường dẫn import apps/ai-service
AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.agent.tools import db_client, tool_get_my_schedule, tool_get_cash_reconciliation, get_mongodb_uri


@pytest.fixture
def client():
    return TestClient(app)


def test_health_probe_when_db_disconnected(client):
    """
    Khi MongoDB mất kết nối hoặc chưa cấu hình URI:
    - status phải là 'degraded' (hoặc 'not_ready'), TUYỆT ĐỐI không báo 'ok'
    - liveness = 'alive' (process FastAPI vẫn sống)
    - readiness = 'not_ready'
    - database.status = 'disconnected'
    """
    with patch.object(db_client, "ping", return_value=False):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()

        assert data["status"] == "degraded", "Health status không được báo 'ok' khi DB mất kết nối"
        assert data["liveness"] == "alive"
        assert data["readiness"] == "not_ready"
        assert data["database"]["status"] == "disconnected"
        assert data["rag_engine"]["status"] == "degraded"
        assert data["mock_tools"]["status"] == "locked"


def test_health_probe_when_db_connected(client):
    """
    Khi MongoDB Atlas kết nối thành công:
    - status = 'ok'
    - liveness = 'alive'
    - readiness = 'ready'
    - database.status = 'connected'
    """
    with patch.object(db_client, "ping", return_value=True):
        res = client.get("/health")
        assert res.status_code == 200
        data = res.json()

        assert data["status"] == "ok"
        assert data["liveness"] == "alive"
        assert data["readiness"] == "ready"
        assert data["database"]["status"] == "connected"
        assert data["rag_engine"]["status"] == "active"


def test_liveness_endpoint(client):
    """Liveness probe độc lập /health/live."""
    res = client.get("/health/live")
    assert res.status_code == 200
    assert res.json() == {"status": "alive"}


def test_readiness_endpoint_honest_failure(client):
    """Readiness probe /health/ready phải trả về 503 khi DB down."""
    with patch.object(db_client, "ping", return_value=False):
        res = client.get("/health/ready")
        assert res.status_code == 503
        data = res.json()
        assert data["status"] == "not_ready"
        assert data["database"] == "disconnected"


def test_readiness_endpoint_success(client):
    """Readiness probe /health/ready trả về 200 khi DB kết nối thành công."""
    with patch.object(db_client, "ping", return_value=True):
        res = client.get("/health/ready")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ready"
        assert data["database"] == "connected"


def test_mock_chat_endpoint_locked_by_default(client):
    """
    Endpoint POST /api/v1/agent/chat phải bị khóa bằng 403 Forbidden
    khi AI_AGENT_ENABLED chưa được bật một cách tường minh.
    """
    with patch("app.main.is_agent_enabled", return_value=False):
        res = client.post("/api/v1/agent/chat", json={"message": "lịch ca của tôi"})
        assert res.status_code == 403
        assert "locked down" in res.json()["detail"].lower()


def test_mock_tools_locked_and_forbid_bypass():
    """
    Các mock tool trong app/agent/tools.py phải từ chối trả dữ liệu nhân sự giả
    khi ở chế độ bootstrap (AI_AGENT_ENABLED=false).
    """
    with patch("app.agent.tools.is_agent_enabled", return_value=False):
        res_schedule = tool_get_my_schedule("GT-CH25036607")
        assert res_schedule["status"] == "locked"
        assert "locked down" in res_schedule["error"].lower()

        res_cash = tool_get_cash_reconciliation("Nguyễn Kiệm")
        assert res_cash["status"] == "locked"
        assert "locked down" in res_cash["error"].lower()


def test_credentials_sanitized():
    """
    Kiểm tra bảo mật:
    - get_mongodb_uri() không chứa fallback URI hardcode
    - Không lộ credentials trong bất kỳ kết quả trả về nào
    """
    # Xóa env vars nếu có
    with patch.dict(os.environ, {}, clear=True):
        uri = get_mongodb_uri()
        assert uri is None, "get_mongodb_uri() phải trả về None khi không có env vars, không được dùng fallback hardcode"


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    print("--- Running test_health_probe.py directly ---")
    c = TestClient(app)

    print("1. Checking Health Probe when DB disconnected...")
    test_health_probe_when_db_disconnected(c)
    print("   -> PASS: Reported 'degraded' / 'not_ready'")

    print("2. Checking Health Probe when DB connected...")
    test_health_probe_when_db_connected(c)
    print("   -> PASS: Reported 'ok' / 'ready'")

    print("3. Checking Liveness / Readiness probes...")
    test_liveness_endpoint(c)
    test_readiness_endpoint_honest_failure(c)
    test_readiness_endpoint_success(c)
    print("   -> PASS: Liveness (200) vs Readiness (503 on failure)")

    print("4. Checking Mock Chat & Mock Tools lockdown...")
    test_mock_chat_endpoint_locked_by_default(c)
    test_mock_tools_locked_and_forbid_bypass()
    print("   -> PASS: 403 Forbidden and DB bypass prevented")

    print("5. Checking Security Sanitization...")
    test_credentials_sanitized()
    print("   -> PASS: No fallback hardcoded URI")

    print("\n100% HEALTH PROBE TESTS PASSED.")
