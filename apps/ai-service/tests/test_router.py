"""Intent catalog + deterministic router tests (FR-015/FR-022, docs/18 catalog)."""

from __future__ import annotations

import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from app.agent.router import INTENTS, classify
from app.agent.tools import TOOL_SPECS


def test_catalog_covers_the_28_intents_plus_assignment_responses():
    ids = {intent.id for intent in INTENTS}
    expected = {str(index) for index in range(1, 29)} | {"12a", "12b", "12c", "25b"}
    assert expected <= ids


def test_every_tool_reference_exists_in_the_tool_catalog():
    for intent in INTENTS:
        if intent.tool is not None:
            assert intent.tool in TOOL_SPECS, intent


def test_unsupported_intents_have_no_tool_and_point_to_dashboard():
    for intent in INTENTS:
        if intent.tool is None:
            assert intent.dashboard_path, intent


def test_classify_department_kpi_before_personal_kpi():
    decision = classify("Cho tôi xem KPI phòng ban tháng này")
    assert decision.tool_name == "get_department_kpi"
    assert decision.intent_id == "20"


def test_classify_personal_kpi():
    decision = classify("KPI của tôi tháng này bao nhiêu?")
    assert decision.tool_name == "get_my_kpi"


def test_classify_policy_question():
    decision = classify("Chu kỳ tính lương và chốt bảng công như thế nào?")
    assert decision.tool_name == "search_policy"
    assert decision.args["query"] == "Chu kỳ tính lương và chốt bảng công như thế nào?"


def test_classify_out_of_scope_defaults_to_policy_qa():
    decision = classify("Thời gian bay của tàu con thoi lên ISS là bao lâu?")
    assert decision.tool_name == "search_policy"
    assert decision.confidence < 0.9


def test_classify_unsupported_write_intent_is_dashboard_only():
    decision = classify("Sửa số điện thoại của tôi thành 0909")
    assert decision.tool_name is None
    assert decision.dashboard_only is True
    assert decision.dashboard_path == "/profile"


def test_classify_report_submission_extracts_args():
    decision = classify("Nộp báo cáo cho đề tài Website nội bộ: đã hoàn thành module đăng nhập")
    assert decision.tool_name == "submit_report"
    assert decision.args["content"]


def test_classify_project_status_extracts_reference():
    decision = classify("Trạng thái đề tài Website nội bộ đang thế nào?")
    assert decision.tool_name == "get_project_status"
    assert decision.args["projectRef"]


def test_classify_expiring_projects_sets_upcoming_only():
    decision = classify("Đề tài nào của tôi sắp hết hạn?")
    assert decision.tool_name == "get_my_projects"
    assert decision.args["upcomingOnly"] is True
