"""Agent loop tests: guard maxSteps, policy path, tool path, dashboard pointer."""

from __future__ import annotations

import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import pytest

from app.agent.loop import AgentLoop
from app.agent.router import RouteDecision, classify
from app.agent.tools import ToolRuntime, UserContext
from app.llm.base import ChatMessage, CompletionResult, ProviderRateLimited
from app.llm.chain import ProviderChain
from app.llm.fake import FakeProvider
from app.rag.corpus import seed_chunks
from app.rag.policy_engine import PolicyEngine
from tests.fakes import FakeDb


@pytest.fixture(autouse=True)
def _enable_agent(monkeypatch):
    monkeypatch.setattr("app.agent.tools.is_agent_enabled", lambda: True)


def _runtime(db: FakeDb | None = None) -> ToolRuntime:
    return ToolRuntime(
        db=db or FakeDb(),
        policy=PolicyEngine(chunks=seed_chunks(), retriever_kind="lexical"),
        ping=lambda: True,
    )


CTX = UserContext.model_validate({"employeeId": "651111111111111111111111", "role": "Employee"})


def test_policy_path_returns_grounded_answer_with_citations():
    chain = ProviderChain([FakeProvider()])
    turn = AgentLoop(_runtime(), chain).run("Chu kỳ tính lương chốt bảng công ngày nào?", CTX)

    assert turn.tool_name == "search_policy"
    assert turn.abstain is False
    assert turn.citations
    assert "[1]" in turn.reply
    assert turn.steps == 1


def test_policy_path_abstains_for_out_of_scope_question():
    chain = ProviderChain([FakeProvider()])
    turn = AgentLoop(_runtime(), chain).run(
        "Thời gian bay của tàu con thoi lên trạm không gian ISS là bao lâu?", CTX
    )

    assert turn.abstain is True
    assert turn.citations == []


def test_tool_path_returns_structured_summary():
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
    turn = AgentLoop(_runtime(db), ProviderChain([FakeProvider()])).run("Xem hồ sơ của tôi", CTX)

    assert turn.tool_name == "get_my_profile"
    assert "Nguyễn Văn A" in turn.reply


def test_unsupported_intent_points_to_dashboard():
    turn = AgentLoop(_runtime(), ProviderChain([FakeProvider()])).run(
        "Sửa số điện thoại của tôi thành 0909", CTX
    )

    assert turn.tool_name is None
    assert "dashboard" in turn.reply.lower()
    assert turn.steps == 1


def test_guard_stops_at_max_steps():
    calls = {"count": 0}

    def planner(message: str, ctx: UserContext, results: list[dict]) -> RouteDecision:
        calls["count"] += 1
        return RouteDecision(
            intent_id="1",
            intent="xem hồ sơ",
            group="Hồ sơ",
            tool_name="get_my_profile",
            kind="read",
            roles=("Admin", "Employee"),
            args={},
        )

    loop = AgentLoop(_runtime(), ProviderChain([FakeProvider()]), planner=planner, max_steps=3)
    turn = loop.run("lặp vô hạn", CTX)

    # 3 tool executions + 1 final planning call that still requests a tool (guard trips).
    assert calls["count"] == 4
    assert turn.guard_exceeded is True
    assert turn.steps == 3
    assert turn.error["code"] == "MAX_STEPS"


def test_strict_provider_raises_when_no_provider_can_answer():
    from app.llm.base import LLMUnavailable

    chain = ProviderChain([])
    with pytest.raises(LLMUnavailable):
        AgentLoop(_runtime(), chain, strict_provider=True).run(
            "Chu kỳ tính lương chốt bảng công ngày nào?", CTX
        )


def test_degraded_mode_returns_extractive_answer_without_provider():
    turn = AgentLoop(_runtime(), None).run("Chu kỳ tính lương chốt bảng công ngày nào?", CTX)

    assert turn.degraded is True
    assert turn.answer_source == "degraded_structured"
    assert turn.citations


def test_empty_message_is_rejected():
    turn = AgentLoop(_runtime(), None).run("   ", CTX)
    assert turn.error["code"] == "EMPTY_MESSAGE"
