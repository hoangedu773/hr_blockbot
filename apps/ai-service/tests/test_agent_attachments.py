"""Tests for Phase 3: AI Agent Loop attachments generation for GUTA forms and reference images."""

from __future__ import annotations

import json
import pytest

from app.agent.loop import AgentLoop, resolve_attachments
from app.agent.tools import ToolRuntime, UserContext
from app.llm.chain import ProviderChain
from app.llm.fake import FakeProvider


@pytest.fixture(autouse=True)
def _enable_agent(monkeypatch):
    monkeypatch.setattr("app.agent.tools.is_agent_enabled", lambda: True)


def test_resolve_attachments_keyword_cong_viec():
    queries = [
        "Cho em xin biên bản bàn giao công việc",
        "mẫu biên bản công việc",
        "hướng dẫn bàn giao cv khi nghỉ việc",
        "cần biểu mẫu bb-cv",
    ]
    for q in queries:
        atts = resolve_attachments(q, [])
        assert any(
            a["fileName"] == "GUTA_Bien_ban_ban_giao_cong_viec.pdf"
            and a["url"] == "/api/attachments/pdf/GUTA_Bien_ban_ban_giao_cong_viec.pdf"
            and a["type"] == "pdf"
            for a in atts
        ), f"Failed for query: {q}"


def test_resolve_attachments_keyword_tai_san():
    queries = [
        "Cho em xin mẫu bàn giao tài sản",
        "biên bản tài sản két sắt",
        "mẫu biên bản bb-ts cửa hàng",
        "quy trình kiểm kê tài sản bàn giao",
    ]
    for q in queries:
        atts = resolve_attachments(q, [])
        assert any(
            a["fileName"] == "GUTA_Bien_ban_ban_giao_tai_san.pdf"
            and a["url"] == "/api/attachments/pdf/GUTA_Bien_ban_ban_giao_tai_san.pdf"
            and a["type"] == "pdf"
            for a in atts
        ), f"Failed for query: {q}"


def test_resolve_attachments_from_policy_citations():
    atts_cv = resolve_attachments("quy định", ["bb_cong_viec"])
    assert len(atts_cv) == 1
    assert atts_cv[0]["fileName"] == "GUTA_Bien_ban_ban_giao_cong_viec.pdf"
    assert atts_cv[0]["url"] == "/api/attachments/pdf/GUTA_Bien_ban_ban_giao_cong_viec.pdf"

    atts_ts = resolve_attachments("quy định", ["bb_tai_san"])
    assert len(atts_ts) == 1
    assert atts_ts[0]["fileName"] == "GUTA_Bien_ban_ban_giao_tai_san.pdf"
    assert atts_ts[0]["url"] == "/api/attachments/pdf/GUTA_Bien_ban_ban_giao_tai_san.pdf"


def test_agent_loop_generates_attachments_cong_viec():
    ctx = UserContext.model_validate({"employeeId": "651111111111111111111111", "role": "Employee"})
    fake_payload = json.dumps({
        "intent": "policy_query",
        "reply": "Dưới đây là mẫu biên bản bàn giao công việc theo quy định GUTA.",
        "citations": ["bb_cong_viec"],
        "proposedAction": None,
        "attachments": [],
    })
    chain = ProviderChain([FakeProvider(scripted=[fake_payload])])
    runtime = ToolRuntime(db=None, policy=None, ping=lambda: False)
    loop = AgentLoop(runtime, chain, strict_provider=False)

    turn = loop.run("Cho em xin biên bản bàn giao công việc", ctx)

    assert turn.attachments, "attachments must not be empty"
    att = turn.attachments[0]
    assert att["fileName"] == "GUTA_Bien_ban_ban_giao_cong_viec.pdf"
    assert att["url"] == "/api/attachments/pdf/GUTA_Bien_ban_ban_giao_cong_viec.pdf"
    assert att["type"] == "pdf"


def test_agent_loop_generates_attachments_tai_san():
    ctx = UserContext.model_validate({"employeeId": "651111111111111111111111", "role": "Employee"})
    fake_payload = json.dumps({
        "intent": "policy_query",
        "reply": "Dưới đây là mẫu biên bản bàn giao tài sản theo quy định GUTA.",
        "citations": ["bb_tai_san"],
        "proposedAction": None,
        "attachments": [],
    })
    chain = ProviderChain([FakeProvider(scripted=[fake_payload])])
    runtime = ToolRuntime(db=None, policy=None, ping=lambda: False)
    loop = AgentLoop(runtime, chain, strict_provider=False)

    turn = loop.run("mẫu bàn giao tài sản", ctx)

    assert turn.attachments, "attachments must not be empty"
    att = turn.attachments[0]
    assert att["fileName"] == "GUTA_Bien_ban_ban_giao_tai_san.pdf"
    assert att["url"] == "/api/attachments/pdf/GUTA_Bien_ban_ban_giao_tai_san.pdf"
    assert att["type"] == "pdf"


def test_agent_loop_fallback_attachments_on_degraded():
    ctx = UserContext.model_validate({"employeeId": "651111111111111111111111", "role": "Employee"})
    # Without any provider, loop enters degraded mode but still resolves attachments from text keywords
    loop = AgentLoop(None, None, strict_provider=False)
    turn = loop.run("Cho em xin biên bản bàn giao công việc", ctx)

    assert turn.degraded is True
    assert turn.attachments, "degraded turn must still resolve attachments"
    assert turn.attachments[0]["fileName"] == "GUTA_Bien_ban_ban_giao_cong_viec.pdf"
    assert turn.attachments[0]["url"] == "/api/attachments/pdf/GUTA_Bien_ban_ban_giao_cong_viec.pdf"
