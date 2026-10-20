"""Intent catalog + deterministic router (FR-015, FR-022).

The catalog mirrors `18-user-flows.md` (28 intents + `#12a..#12c`) with the tool
mapping used by phase-04 §5. Intents without a tool must NOT invent one: they answer
with a dashboard pointer (FR-022).

The same catalog is the `degraded-structured` router from docs/08 §6.3 — when no LLM is
available, intent selection falls back to these keyword rules instead of dying. The
`confidence` field marks that this is a rule match, not model output.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

from app.text_utils import normalize_text


@dataclass(frozen=True)
class IntentDef:
    id: str
    group: str
    text: str
    tool: str | None
    kind: Literal["read", "write", "clarify"]
    roles: tuple[str, ...]
    keywords: tuple[str, ...] = ()
    dashboard_path: str | None = None


# Order matters: first match wins, so specific intents come before general ones.
INTENTS: tuple[IntentDef, ...] = (
    IntentDef("12a", "Đề tài", "tôi nhận đề tài này", None, "write", ("Employee",),
              ("nhận đề tài", "nhận việc", "tôi nhận"), "/projects"),
    IntentDef("12b", "Đề tài", "tôi không nhận được, lý do…", None, "write", ("Employee",),
              ("từ chối đề tài", "không nhận đề tài", "từ chối việc"), "/projects"),
    IntentDef("12c", "Đề tài", "tôi muốn xin đổi thời gian/yêu cầu", None, "write", ("Employee",),
              ("xin đổi thời gian", "xin đổi yêu cầu", "đổi thời hạn"), "/projects"),
    IntentDef("2", "Hồ sơ", "sửa số điện thoại", None, "write", ("Employee",),
              ("sửa số điện thoại", "đổi số điện thoại", "cập nhật số điện thoại"), "/profile"),
    IntentDef("23", "KPI", "gửi nhận xét", None, "write", ("Admin", "Employee"),
              ("gửi nhận xét", "viết nhận xét", "self review", "tự nhận xét"), "/kpi"),
    IntentDef("24", "KPI", "yêu cầu điều chỉnh điểm", None, "write", ("Admin",),
              ("điều chỉnh điểm", "sửa điểm kpi", "override kpi"), "/admin/kpi"),
    IntentDef("9", "Đề tài", "cập nhật tiến độ", None, "write", ("Employee",),
              ("cập nhật tiến độ", "báo cáo tiến độ", "tiến độ bao nhiêu phần trăm"), "/projects"),
    IntentDef("11", "Đề tài", "yêu cầu duyệt báo cáo", None, "write", ("Employee",),
              ("yêu cầu duyệt", "xin duyệt báo cáo", "gửi duyệt"), "/projects"),
    IntentDef("10", "Đề tài", "nộp báo cáo", "submit_report", "write", ("Employee",),
              ("nộp báo cáo", "báo cáo nghiệm thu", "nộp nghiệm thu"), "/projects"),
    IntentDef("21", "KPI", "so sánh KPI theo tháng", None, "read", ("Admin",),
              ("so sánh kpi", "kpi nhiều tháng", "so sánh điểm"), "/kpi"),
    IntentDef("22", "KPI", "giải thích điểm KPI", None, "read", ("Admin", "Employee"),
              ("giải thích điểm", "vì sao điểm kpi", "tại sao điểm"), "/kpi"),
    IntentDef("17", "Matching", "kiểm tra workload", None, "read", ("Admin",),
              ("workload", "khối lượng công việc", "ai đang rảnh"), "/admin/matching"),
    IntentDef("13", "Matching", "tìm người phù hợp cho đề tài", None, "read", ("Admin",),
              ("tìm người phù hợp", "gợi ý nhân sự", "chọn người cho đề tài"), "/admin/matching"),
    IntentDef("14", "Matching", "vì sao đề xuất nhân viên này", None, "read", ("Admin",),
              ("vì sao đề xuất", "giải thích match", "gợi ý này dựa trên"), "/admin/matching"),
    IntentDef("15", "Matching", "tìm top 5 nhân viên", None, "read", ("Admin",),
              ("top 5 nhân viên", "top nhân viên"), "/admin/matching"),
    IntentDef("16", "Matching", "lọc theo kỹ năng", None, "read", ("Admin",),
              ("lọc theo kỹ năng", "nhân viên có kỹ năng"), "/admin/matching"),
    IntentDef("18", "Matching", "hỏi thêm khi AI không chắc", None, "clarify", ("Admin",),
              (), "/admin/matching"),
    IntentDef("28", "Notification", "tóm tắt công việc hôm nay", None, "read", ("Admin", "Employee"),
              ("tóm tắt công việc", "hôm nay tôi làm gì", "việc hôm nay"), "/dashboard"),
    IntentDef("20", "KPI", "KPI phòng ban", "get_department_kpi", "read", ("Admin",),
              ("kpi phòng ban", "kpi của phòng", "kpi phòng", "kpi bộ phận"), "/admin/kpi"),
    IntentDef("19", "KPI", "KPI của tôi tháng này", "get_my_kpi", "read", ("Admin", "Employee"),
              ("kpi của tôi", "điểm kpi", "kpi tháng", "kpi cá nhân", "kpi của mình"), "/kpi"),
    IntentDef("7", "Đề tài", "xem đề tài sắp hết hạn", "get_my_projects", "read", ("Admin", "Employee"),
              ("sắp hết hạn", "hết hạn", "deadline", "quá hạn", "sắp đến hạn", "việc nào sắp"), "/projects"),
    IntentDef("27", "Notification", "việc nào sắp quá hạn", "get_my_projects", "read", ("Admin", "Employee"),
              ("việc nào sắp quá hạn", "sắp quá hạn"), "/dashboard"),
    IntentDef("8", "Đề tài", "xem trạng thái đề tài", "get_project_status", "read", ("Admin", "Employee"),
              ("trạng thái đề tài", "trạng thái của đề tài", "đề tài đang ở đâu",
               "tiến độ đề tài", "tình trạng đề tài"), "/projects"),
    IntentDef("12", "Đề tài", "xem lý do bị từ chối", "get_project_status", "read", ("Admin", "Employee"),
              ("lý do bị từ chối", "vì sao bị từ chối", "lý do từ chối"), "/projects"),
    IntentDef("6", "Đề tài", "xem đề tài của tôi", "get_my_projects", "read", ("Admin", "Employee"),
              ("đề tài của tôi", "công việc của tôi", "task của tôi", "dự án của tôi", "đề tài của mình"),
              "/projects"),
    IntentDef("3", "Hồ sơ", "xem phòng ban", "get_my_profile", "read", ("Admin", "Employee"),
              ("phòng ban của tôi", "tôi thuộc phòng", "phòng ban nào"), "/profile"),
    IntentDef("4", "Hồ sơ", "xem cấp bậc", "get_my_profile", "read", ("Admin", "Employee"),
              ("cấp bậc", "level của tôi", "chức danh của tôi"), "/profile"),
    IntentDef("5", "Hồ sơ", "xem kỹ năng", "get_my_profile", "read", ("Admin", "Employee"),
              ("kỹ năng của tôi", "skill của tôi", "kỹ năng của mình"), "/profile"),
    IntentDef("1", "Hồ sơ", "xem hồ sơ của tôi", "get_my_profile", "read", ("Admin", "Employee"),
              ("hồ sơ của tôi", "thông tin cá nhân", "xem hồ sơ", "profile của tôi"), "/profile"),
    IntentDef("25", "Chính sách", "hỏi quy định công ty", "search_policy", "read", ("Admin", "Employee"),
              ("quy định", "chính sách", "quy chế", "nội quy", "điều lệ", "được hưởng",
               "lương", "nghỉ", "chấm công", "ca làm", "két tiền", "đào tạo", "lễ tết"),
              "/policies"),
    IntentDef("26", "Chính sách", "hỏi quy trình nghiệp vụ", "search_policy", "read", ("Admin", "Employee"),
              ("quy trình", "thủ tục", "các bước", "làm thế nào để", "hướng dẫn"), "/policies"),
    # Default policy-QA intent so out-of-scope questions reach retrieval and abstain.
    IntentDef("25b", "Chính sách", "câu hỏi chính sách (mặc định)", "search_policy", "read", ("Admin", "Employee"),
              (), "/policies"),
)

CATALOG_VERSION = "phase-04-catalog-1"
POLICY_TOOL = "search_policy"

_PERIOD_RE = re.compile(r"\b(20\d{2})[-/](0?[1-9]|1[0-2])\b")
_PROJECT_REF_RE = re.compile(r"(?:đề tài|dự án|task)\s+(?:có tên|tên|là|:)?\s*[\"“']?([^\"”'\n,.;]{2,80})", re.IGNORECASE)


@dataclass
class RouteDecision:
    intent_id: str
    intent: str
    group: str
    tool_name: str | None
    kind: str
    roles: tuple[str, ...]
    args: dict[str, Any] = field(default_factory=dict)
    dashboard_only: bool = False
    dashboard_path: str | None = None
    confidence: float = 0.9
    reply_hint: str | None = None

    @property
    def is_policy(self) -> bool:
        return self.tool_name == POLICY_TOOL


def _match_keywords(message: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in message for keyword in keywords)


def _extract_project_ref(message: str) -> str | None:
    match = _PROJECT_REF_RE.search(message)
    if not match:
        return None
    ref = match.group(1).strip(" .:-")
    return ref or None


def _extract_period(message: str) -> str | None:
    match = _PERIOD_RE.search(message)
    if not match:
        return None
    return f"{match.group(1)}-{int(match.group(2)):02d}"


def _extract_report_args(message: str) -> dict[str, Any]:
    project_ref = _extract_project_ref(message) or ""
    content = ""
    for separator in (":", "nội dung"):
        if separator in message:
            content = message.split(separator, 1)[1].strip()
            break
    if not content:
        content = message
    return {"projectRef": project_ref, "content": content[:4000]}


def classify(message: str) -> RouteDecision:
    """Keyword/rule router; deterministic and offline (no LLM call)."""
    normalised = normalize_text(message)
    for intent in INTENTS:
        if not _match_keywords(normalised, intent.keywords):
            continue
        decision = RouteDecision(
            intent_id=intent.id,
            intent=intent.text,
            group=intent.group,
            tool_name=intent.tool,
            kind=intent.kind,
            roles=intent.roles,
            confidence=0.9 if intent.keywords else 0.4,
            dashboard_only=intent.tool is None,
            dashboard_path=intent.dashboard_path,
        )
        if intent.tool == "search_policy":
            decision.args = {"query": message}
        elif intent.tool == "get_my_projects":
            decision.args = {
                "upcomingOnly": intent.id in ("7", "27"),
                "limit": 5,
            }
        elif intent.tool == "get_project_status":
            ref = _extract_project_ref(normalised)
            if ref:
                decision.args = {"projectRef": ref}
        elif intent.tool == "get_my_kpi":
            period = _extract_period(normalised)
            if period:
                decision.args = {"period": period}
        elif intent.tool == "get_department_kpi":
            period = _extract_period(normalised)
            if period:
                decision.args = {"period": period}
        elif intent.tool == "submit_report":
            decision.args = _extract_report_args(normalised)
        return decision
    # Unreachable while #25b (catch-all policy intent) exists, kept as a guard.
    return RouteDecision(
        intent_id="25b",
        intent="câu hỏi chính sách (mặc định)",
        group="Chính sách",
        tool_name=POLICY_TOOL,
        kind="read",
        roles=("Admin", "Employee"),
        args={"query": message},
        confidence=0.3,
    )


DASHBOARD_REPLY = (
    "Tính năng này chưa được hỗ trợ qua chat ở phiên bản hiện tại (FR-022). "
    "Vui lòng thao tác trên dashboard web{path}."
)


def dashboard_reply(decision: RouteDecision) -> str:
    path = f" ({decision.dashboard_path})" if decision.dashboard_path else ""
    return DASHBOARD_REPLY.format(path=path)
