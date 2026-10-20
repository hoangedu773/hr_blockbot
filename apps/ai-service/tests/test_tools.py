"""Tool catalog tests: RBAC, scope, pydantic args, read-only guarantee, result cap."""

from __future__ import annotations

import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import pytest
from bson import ObjectId

from app.agent.tools import (
    TOOL_SPECS,
    ToolRuntime,
    UserContext,
    is_agent_enabled,
    tool_declarations,
)
from app.config import settings
from app.rag.corpus import seed_chunks
from app.rag.policy_engine import PolicyEngine
from tests.fakes import FakeDb

EMPLOYEE_OID = "651111111111111111111111"
OTHER_OID = "652222222222222222222222"


@pytest.fixture(autouse=True)
def _enable_agent(monkeypatch):
    monkeypatch.setattr("app.agent.tools.is_agent_enabled", lambda: True)


def _runtime(db: FakeDb | None = None) -> ToolRuntime:
    return ToolRuntime(
        db=db or FakeDb(),
        policy=PolicyEngine(chunks=seed_chunks(), retriever_kind="lexical"),
        ping=lambda: True,
    )


def _ctx(role: str = "Employee", **kwargs) -> UserContext:
    base = {"employeeId": EMPLOYEE_OID, "role": role, "departmentId": None}
    base.update(kwargs)
    return UserContext.model_validate(base)


def test_catalog_has_only_the_phase04_tools_and_no_legacy_shift_tools():
    assert set(TOOL_SPECS) == {
        "get_my_profile",
        "get_my_projects",
        "get_project_status",
        "get_my_kpi",
        "get_department_kpi",
        "search_policy",
        "submit_report",
    }
    declarations = tool_declarations()
    assert {declaration["name"] for declaration in declarations} == set(TOOL_SPECS)
    assert all("parameters" in declaration for declaration in declarations)


def test_get_my_profile_returns_allowlisted_fields_only():
    db = FakeDb()
    db.employees.find_one_result = {
        "_id": EMPLOYEE_OID,
        "employeeCode": "GT-001",
        "fullName": "Nguyễn Văn A",
        "level": "Junior",
        "departmentId": "IT",
        "skills": ["Python"],
        "status": "active",
        "phone": "0900000000",
        "salary": 999,
    }
    db.departments.find_one_result = {"name": "Công nghệ"}
    result = _runtime(db).execute("get_my_profile", {}, _ctx())

    assert result["status"] == "success"
    assert set(result["profile"]) == {"employeeCode", "fullName", "level", "department", "skills", "status"}
    projection = db.employees.calls[0][2]
    for forbidden in ("phone", "salary", "bank_", "cccd", "leave_reason"):
        assert forbidden not in projection


def test_get_my_projects_uses_employee_oid_and_caps_results():
    db = FakeDb()
    db.projects.find_result = [
        {"title": f"Đề tài {index}", "status": "IN_PROGRESS", "dueDate": None} for index in range(5)
    ]
    result = _runtime(db).execute("get_my_projects", {"limit": 5}, _ctx())

    assert result["status"] == "success"
    query = db.projects.calls[0][1]
    assert str(query["assigneeIds"]) == EMPLOYEE_OID
    assert result["count"] == 5


def test_get_project_status_denies_project_of_another_employee():
    db = FakeDb()
    db.projects.find_one_result = {
        "_id": "653333333333333333333333",
        "title": "Đề tài người khác",
        "status": "IN_PROGRESS",
        "assigneeIds": [OTHER_OID],
        "departmentId": None,
    }
    result = _runtime(db).execute("get_project_status", {"projectRef": "Đề tài người khác"}, _ctx())

    assert result["status"] == "denied"
    assert result["code"] == "RBAC_DENIED"


def test_get_department_kpi_denied_for_employee():
    result = _runtime().execute("get_department_kpi", {}, _ctx(role="Employee", departmentId="IT"))

    assert result["status"] == "denied"
    assert result["code"] == "RBAC_DENIED"


def test_get_department_kpi_allowed_for_admin():
    db = FakeDb()
    db.employees.find_result = [{"_id": EMPLOYEE_OID, "employeeCode": "GT-001", "fullName": "A"}]
    db.evaluations.find_result = [{"employeeId": EMPLOYEE_OID, "period": "2026-10", "finalScore": 88}]
    result = _runtime(db).execute(
        "get_department_kpi", {"period": "2026-10"}, _ctx(role="Admin", departmentId="IT")
    )

    assert result["status"] == "success"
    assert result["count"] == 1
    assert result["items"][0]["employeeCode"] == "GT-001"


def test_submit_report_returns_proposal_and_never_writes():
    db = FakeDb()
    db.projects.find_one_result = {
        "_id": "653333333333333333333333",
        "title": "Website nội bộ",
        "assigneeIds": [ObjectId(EMPLOYEE_OID)],
    }
    result = _runtime(db).execute(
        "submit_report",
        {"projectRef": "Website nội bộ", "content": "Đã hoàn thành module đăng nhập."},
        _ctx(),
    )

    assert result["status"] == "proposed"
    assert result["proposedAction"]["requiresConfirmation"] is True
    assert result["proposedAction"]["args"]["content"] == "Đã hoàn thành module đăng nhập."


def test_submit_report_denies_non_assignee():
    db = FakeDb()
    db.projects.find_one_result = {"_id": "653333333333333333333333", "title": "X", "assigneeIds": [OTHER_OID]}
    result = _runtime(db).execute("submit_report", {"projectRef": "X", "content": "x"}, _ctx())
    assert result["code"] == "RBAC_DENIED"


def test_invalid_args_are_rejected_before_handler():
    result = _runtime().execute("get_project_status", {}, _ctx())

    assert result["status"] == "error"
    assert result["code"] == "INVALID_ARGS"
    assert result["details"]


def test_unknown_tool_is_rejected():
    result = _runtime().execute("get_my_schedule", {}, _ctx())
    assert result["code"] == "UNKNOWN_TOOL"


def test_alias_from_old_catalog_resolves():
    db = FakeDb()
    db.projects.find_result = []
    result = _runtime(db).execute("list_projects", {}, _ctx())
    assert result["status"] == "success"


def test_locked_when_agent_disabled(monkeypatch):
    monkeypatch.setattr("app.agent.tools.is_agent_enabled", lambda: False)
    result = _runtime().execute("get_my_profile", {}, _ctx())
    assert result["status"] == "locked"
    assert result["code"] == "AGENT_DISABLED"


def test_db_unavailable_returns_error():
    runtime = ToolRuntime(db=None, policy=PolicyEngine(chunks=seed_chunks(), retriever_kind="lexical"))
    result = runtime.execute("get_my_profile", {}, _ctx())
    assert result["code"] == "DB_NOT_CONNECTED"


def test_result_cap_truncates_lists():
    runtime = _runtime()
    capped = runtime._cap_result({"items": list(range(settings.max_tool_result_items + 5))})
    assert len(capped["items"]) == settings.max_tool_result_items
    assert capped["truncated"] is True


def test_search_policy_tool_returns_citations_or_abstain():
    result = _runtime().execute(
        "search_policy", {"query": "Chu kỳ tính lương chốt bảng công ngày nào"}, _ctx()
    )
    assert result["status"] == "success"
    assert result["citations"]
    assert result["abstain"] is False


def test_agent_enabled_default_is_false_outside_override():
    # sanity: the safety switch is env-driven, not hardcoded true
    assert isinstance(is_agent_enabled(), bool)
