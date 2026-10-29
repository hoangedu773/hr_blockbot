"""Tool catalog (read-only runtime) + RBAC/scope/guards.

Replaces the legacy shift-domain tools (`get_my_schedule`, `get_cash_reconciliation`,
…) that phase-04 removes. Nothing here mutates MongoDB: `submit_report` returns a
proposal that `apps/api` must execute after the user confirms (FR-020, D-21.2).

Naming note: phase-04 §5 lists `get_my_projects` / `get_project_status`; the older
`18-user-flows.md` catalog used `list_projects` / `get_project`. Both names resolve
here (alias map) so a contract change does not break the chatbot; the canonical name
returned to clients is the phase-04 one.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass
from typing import Any, Callable, Literal

from bson import ObjectId
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.config import settings
from app.rag.policy_engine import PolicyEngine

# --- context & results -----------------------------------------------------------


class UserContext(BaseModel):
    """Scoped identity passed by `apps/api` after JWT verification (server-injected)."""

    model_config = ConfigDict(populate_by_name=True)

    user_id: str | None = Field(default=None, validation_alias=AliasChoices("userId", "user_id"))
    employee_id: str | None = Field(default=None, validation_alias=AliasChoices("employeeId", "employee_id"))
    employee_code: str | None = Field(
        default=None, validation_alias=AliasChoices("employeeCode", "employee_code")
    )
    role: Literal["Admin", "Employee"] = Field(default="Employee")
    department_id: str | None = Field(
        default=None, validation_alias=AliasChoices("departmentId", "department_id")
    )
    # Manager tier from job_title (admin|aom|sm|am|ptch|staff). Auth `role` only
    # knows Admin|Employee, so an SM would otherwise get staff guidance.
    business_role: Literal["admin", "aom", "sm", "am", "ptch", "staff"] | None = Field(
        default=None, validation_alias=AliasChoices("businessRole", "business_role")
    )
    store_name: str | None = Field(default=None, validation_alias=AliasChoices("storeName", "store_name"))

    @field_validator("role", mode="before")
    @classmethod
    def _normalise_role(cls, value: Any) -> str:
        text = str(value or "Employee").strip().lower()
        if text in ("admin", "administrator"):
            return "Admin"
        return "Employee"


class NoArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProfileArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MyProjectsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["DRAFT", "ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"] | None = None
    upcomingOnly: bool = False
    limit: int | None = Field(default=None, ge=1, le=20)


class ProjectStatusArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    projectRef: str = Field(min_length=1, max_length=120, description="project id or title fragment")


class KpiArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period: str | None = Field(default=None, max_length=20, description="evaluation period, e.g. 2026-10")


class DepartmentKpiArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period: str | None = Field(default=None, max_length=20)


class SearchPolicyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1, max_length=500)
    topK: int | None = Field(default=None, ge=1, le=10)


class SubmitReportArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    projectRef: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=4000)


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    args_model: type[BaseModel]
    kind: Literal["read", "write"]
    allowed_roles: tuple[str, ...]
    handler: Callable[["ToolRuntime", BaseModel, UserContext], dict[str, Any]]

    def declaration(self) -> dict[str, Any]:
        schema = self.args_model.model_json_schema()
        schema.pop("title", None)
        return {"name": self.name, "description": self.description, "parameters": schema}


class ToolTimeoutError(Exception):
    pass


# --- db helpers ------------------------------------------------------------------


def _db(runtime: "ToolRuntime") -> Any:
    return runtime.db


def _to_oid(value: str | None) -> ObjectId | None:
    if not value:
        return None
    try:
        return ObjectId(str(value))
    except Exception:  # noqa: BLE001 - non-ObjectId identifiers stay as-is
        return None


def _resolve_employee(runtime: "ToolRuntime", ctx: UserContext) -> tuple[Any, dict[str, Any] | None]:
    """Return `(employee _id, error)`; reads only the identifier column."""
    oid = _to_oid(ctx.employee_id)
    if oid is not None:
        return oid, None
    code = (ctx.employee_code or "").strip()
    if not code:
        return None, {
            "status": "denied",
            "code": "SCOPE_DENIED",
            "message": "Thiếu định danh nhân viên (employeeId/employeeCode) trong ngữ cảnh xác thực.",
        }
    row = _db(runtime).employees.find_one(
        {"$or": [{"employeeCode": code}, {"employee_code": code}, {"code": code}]},
        {"_id": 1}
    )
    if not row:
        return None, {"status": "not_found", "code": "EMPLOYEE_NOT_FOUND", "message": "Không tìm thấy hồ sơ nhân viên."}
    return row.get("_id"), None


def _department_name(runtime: "ToolRuntime", department_id: Any) -> str | None:
    if department_id is None:
        return None
    query: dict[str, Any] = {"_id": department_id}
    oid = _to_oid(str(department_id))
    if oid is not None:
        query = {"$or": [{"_id": oid}, {"code": str(department_id)}]}
    else:
        query = {"code": str(department_id)}
    row = _db(runtime).departments.find_one(query, {"_id": 0, "name": 1})
    return (row or {}).get("name")


# --- handlers: read tools --------------------------------------------------------


def _get_my_profile(runtime: "ToolRuntime", args: BaseModel, ctx: UserContext) -> dict[str, Any]:
    oid, error = _resolve_employee(runtime, ctx)
    if error:
        return error
    query: dict[str, Any] = (
        {"_id": oid}
        if oid
        else {"$or": [{"employeeCode": ctx.employee_code}, {"employee_code": ctx.employee_code}]}
    )
    projection = {
        "_id": 0,
        "employeeCode": 1,
        "employee_code": 1,
        "fullName": 1,
        "full_name": 1,
        "level": 1,
        "departmentId": 1,
        "skills": 1,
        "status": 1,
    }
    row = _db(runtime).employees.find_one(query, projection)
    if not row:
        return {"status": "not_found", "code": "EMPLOYEE_NOT_FOUND", "message": "Không tìm thấy hồ sơ nhân viên."}
    department = _department_name(runtime, row.get("departmentId"))
    emp_code = row.get("employeeCode") or row.get("employee_code")
    full_name = row.get("fullName") or row.get("full_name")
    return {
        "status": "success",
        "tool": "get_my_profile",
        "profile": {
            "employeeCode": emp_code,
            "fullName": full_name,
            "level": row.get("level"),
            "department": department,
            "skills": row.get("skills") or [],
            "status": row.get("status"),
        },
        "summary": (
            f"Hồ sơ của bạn: {full_name or 'N/A'} "
            f"(mã {emp_code or 'N/A'}), cấp bậc {row.get('level') or 'N/A'}, "
            f"phòng ban {department or 'N/A'}."
        ),
    }


def _project_projection() -> dict[str, int]:
    return {
        "_id": 0,
        "title": 1,
        "status": 1,
        "dueDate": 1,
        "progressPct": 1,
        "version": 1,
        "updatedAt": 1,
        "requiredSkills": 1,
        "departmentId": 1,
    }


def _get_my_projects(runtime: "ToolRuntime", args: MyProjectsArgs, ctx: UserContext) -> dict[str, Any]:
    oid, error = _resolve_employee(runtime, ctx)
    if error:
        return error
    query: dict[str, Any] = {"assigneeIds": oid}
    if args.status:
        query["status"] = args.status
    if args.upcomingOnly:
        from datetime import datetime, timedelta, timezone

        query["dueDate"] = {"$lte": datetime.now(timezone.utc) + timedelta(days=7)}
        query["status"] = {"$ne": "COMPLETED"}
    limit = min(args.limit or settings.max_tool_result_items, settings.max_tool_result_items)
    rows = list(_db(runtime).projects.find(query, _project_projection()).sort("dueDate", 1).limit(limit))
    items = [
        {
            "title": row.get("title"),
            "status": row.get("status"),
            "dueDate": row.get("dueDate").isoformat() if hasattr(row.get("dueDate"), "isoformat") else row.get("dueDate"),
            "progressPct": row.get("progressPct"),
        }
        for row in rows
    ]
    return {
        "status": "success",
        "tool": "get_my_projects",
        "count": len(items),
        "items": items,
        "summary": (
            f"Bạn có {len(items)} đề tài đang phụ trách"
            + (" sắp đến hạn (7 ngày tới)" if args.upcomingOnly else "")
            + "."
        ),
    }


def _find_project(runtime: "ToolRuntime", project_ref: str) -> dict[str, Any] | None:
    oid = _to_oid(project_ref)
    query: dict[str, Any] = {"$or": [{"_id": oid}]} if oid is not None else {}
    if oid is None:
        query = {"title": {"$regex": re.escape(project_ref.strip()), "$options": "i"}}
    else:
        query["$or"].append({"title": {"$regex": re.escape(project_ref.strip()), "$options": "i"}})
    projection = dict(_project_projection(), assigneeIds=1, statusHistory=1)
    return _db(runtime).projects.find_one(query, projection)


def _get_project_status(runtime: "ToolRuntime", args: ProjectStatusArgs, ctx: UserContext) -> dict[str, Any]:
    project = _find_project(runtime, args.projectRef)
    if not project:
        return {"status": "not_found", "code": "PROJECT_NOT_FOUND", "message": "Không tìm thấy đề tài."}

    employee_oid, error = _resolve_employee(runtime, ctx)
    if error:
        return error
    assignees = project.get("assigneeIds") or []
    if ctx.role != "Admin" and employee_oid is not None and employee_oid not in assignees:
        # Fail-closed: do not reveal another employee's project.
        return {"status": "denied", "code": "RBAC_DENIED", "message": "Bạn không được giao đề tài này."}
    if ctx.role == "Admin":
        department = project.get("departmentId")
        if ctx.department_id and str(department) != str(ctx.department_id):
            return {
                "status": "denied",
                "code": "RBAC_DENIED",
                "message": "Đề tài nằm ngoài phạm vi phòng ban của bạn.",
            }

    history = list(project.get("statusHistory") or [])[-3:]
    return {
        "status": "success",
        "tool": "get_project_status",
        "project": {
            "title": project.get("title"),
            "status": project.get("status"),
            "version": project.get("version"),
            "dueDate": project.get("dueDate").isoformat()
            if hasattr(project.get("dueDate"), "isoformat")
            else project.get("dueDate"),
            "progressPct": project.get("progressPct"),
            "statusHistory": [
                {
                    "to": entry.get("to"),
                    "reason": entry.get("reason"),
                    "at": entry.get("at").isoformat() if hasattr(entry.get("at"), "isoformat") else entry.get("at"),
                }
                for entry in history
            ],
        },
        "summary": (
            f"Đề tài '{project.get('title')}' đang ở trạng thái {project.get('status')} "
            f"(phiên bản {project.get('version')})."
        ),
    }


def _evaluation_projection() -> dict[str, int]:
    return {
        "_id": 0,
        "employeeId": 1,
        "period": 1,
        "machineScore": 1,
        "finalScore": 1,
        "status": 1,
        "publishedAt": 1,
        "explanation": 1,
    }


def _get_my_kpi(runtime: "ToolRuntime", args: KpiArgs, ctx: UserContext) -> dict[str, Any]:
    oid, error = _resolve_employee(runtime, ctx)
    if error:
        return error
    query: dict[str, Any] = {"employeeId": oid}
    if args.period:
        query["period"] = args.period
    rows = list(_db(runtime).evaluations.find(query, _evaluation_projection()).sort("period", -1).limit(1))
    if not rows:
        return {"status": "not_found", "code": "KPI_NOT_FOUND", "message": "Chưa có bản đánh giá KPI cho kỳ này."}
    row = rows[0]
    return {
        "status": "success",
        "tool": "get_my_kpi",
        "kpi": {
            "period": row.get("period"),
            "machineScore": row.get("machineScore"),
            "finalScore": row.get("finalScore"),
            "status": row.get("status"),
            "explanation": row.get("explanation"),
        },
        "summary": f"KPI kỳ {row.get('period')}: điểm cuối {row.get('finalScore')} (trạng thái {row.get('status')}).",
    }


def _get_department_kpi(runtime: "ToolRuntime", args: DepartmentKpiArgs, ctx: UserContext) -> dict[str, Any]:
    if not ctx.department_id:
        return {"status": "denied", "code": "SCOPE_DENIED", "message": "Thiếu phạm vi phòng ban trong ngữ cảnh xác thực."}
    department_oid = _to_oid(ctx.department_id)
    employee_query = {"departmentId": department_oid if department_oid is not None else ctx.department_id}
    employees = list(
        _db(runtime).employees.find(employee_query, {"_id": 1, "employeeCode": 1, "fullName": 1}).limit(
            settings.max_tool_result_items
        )
    )
    if not employees:
        return {"status": "not_found", "code": "DEPARTMENT_EMPTY", "message": "Phòng ban chưa có nhân sự trong hệ thống."}
    employee_ids = [row["_id"] for row in employees if row.get("_id") is not None]
    query: dict[str, Any] = {"employeeId": {"$in": employee_ids}}
    if args.period:
        query["period"] = args.period
    evaluations = list(_db(runtime).evaluations.find(query, _evaluation_projection()))
    name_by_id = {str(row["_id"]): row.get("fullName") for row in employees}
    code_by_id = {str(row["_id"]): row.get("employeeCode") for row in employees}
    items = [
        {
            "employeeCode": code_by_id.get(str(row.get("employeeId"))),
            "fullName": name_by_id.get(str(row.get("employeeId"))),
            "period": row.get("period"),
            "finalScore": row.get("finalScore"),
        }
        for row in evaluations
    ]
    return {
        "status": "success",
        "tool": "get_department_kpi",
        "count": len(items),
        "items": items,
        "summary": f"KPI phòng ban: {len(items)} bản đánh giá"
        + (f" kỳ {args.period}" if args.period else "") + ".",
    }


def _search_policy(runtime: "ToolRuntime", args: SearchPolicyArgs, ctx: UserContext) -> dict[str, Any]:
    retrieval = runtime.policy.retrieve(args.query, k=args.topK)
    from app.rag.answer import answer_policy

    result = answer_policy(args.query, retrieval, None)
    payload = result.as_dict()
    payload["status"] = "success"
    payload["tool"] = "search_policy"
    payload["summary"] = result.answer
    return payload


# --- handlers: write tools (proposals only) -------------------------------------


def _submit_report(runtime: "ToolRuntime", args: SubmitReportArgs, ctx: UserContext) -> dict[str, Any]:
    project = _find_project(runtime, args.projectRef)
    if not project:
        return {"status": "not_found", "code": "PROJECT_NOT_FOUND", "message": "Không tìm thấy đề tài."}
    employee_oid, error = _resolve_employee(runtime, ctx)
    if error:
        return error
    if employee_oid is None or employee_oid not in (project.get("assigneeIds") or []):
        return {"status": "denied", "code": "RBAC_DENIED", "message": "Bạn không được giao đề tài này."}
    project_title = project.get("title")
    return {
        "status": "proposed",
        "tool": "submit_report",
        "proposedAction": {
            "type": "submit_report",
            "requiresConfirmation": True,
            "args": {
                "projectId": str(project.get("_id")),
                "projectTitle": project_title,
                "submitterId": str(employee_oid),
                "content": args.content,
            },
            "preview": f"Nộp báo cáo nghiệm thu cho đề tài '{project_title}' ({len(args.content)} ký tự).",
        },
        "summary": (
            "Mình đã chuẩn bị đề xuất nộp báo cáo; cần bạn xác nhận trên giao diện trước khi ghi. "
            "AI service không tự ghi dữ liệu."
        ),
    }


# --- catalog ---------------------------------------------------------------------

TOOL_SPECS: dict[str, ToolSpec] = {
    "get_my_profile": ToolSpec(
        name="get_my_profile",
        description="Đọc hồ sơ của chính người dùng đang đăng nhập (allowlist field, không PII nhạy cảm).",
        args_model=ProfileArgs,
        kind="read",
        allowed_roles=("Admin", "Employee"),
        handler=_get_my_profile,
    ),
    "get_my_projects": ToolSpec(
        name="get_my_projects",
        description="Liệt kê đề tài được giao cho chính người dùng, lọc theo trạng thái hoặc sắp hết hạn.",
        args_model=MyProjectsArgs,
        kind="read",
        allowed_roles=("Admin", "Employee"),
        handler=_get_my_projects,
    ),
    "get_project_status": ToolSpec(
        name="get_project_status",
        description="Xem trạng thái, phiên bản, tiến độ và lịch sử gần nhất của một đề tài trong phạm vi được phép.",
        args_model=ProjectStatusArgs,
        kind="read",
        allowed_roles=("Admin", "Employee"),
        handler=_get_project_status,
    ),
    "get_my_kpi": ToolSpec(
        name="get_my_kpi",
        description="Đọc bản đánh giá KPI của chính người dùng theo kỳ.",
        args_model=KpiArgs,
        kind="read",
        allowed_roles=("Admin", "Employee"),
        handler=_get_my_kpi,
    ),
    "get_department_kpi": ToolSpec(
        name="get_department_kpi",
        description="Đọc KPI tổng hợp của phòng ban. Chỉ Admin.",
        args_model=DepartmentKpiArgs,
        kind="read",
        allowed_roles=("Admin",),
        handler=_get_department_kpi,
    ),
    "search_policy": ToolSpec(
        name="search_policy",
        description="Tra cứu chính sách/quy chế đang lưu bằng hybrid retrieval; trả citations hoặc abstain.",
        args_model=SearchPolicyArgs,
        kind="read",
        allowed_roles=("Admin", "Employee"),
        handler=_search_policy,
    ),
    "submit_report": ToolSpec(
        name="submit_report",
        description="Đề xuất nộp báo cáo nghiệm thu. Chỉ tạo proposed_action, không ghi DB; cần người dùng xác nhận.",
        args_model=SubmitReportArgs,
        kind="write",
        allowed_roles=("Admin", "Employee"),
        handler=_submit_report,
    ),
}

# Backward-compatible names from the older `18-user-flows.md` tool catalog.
TOOL_ALIASES = {
    "list_projects": "get_my_projects",
    "get_project": "get_project_status",
    "get_employee": "get_my_profile",
}


def resolve_tool_name(name: str) -> str | None:
    canonical = TOOL_ALIASES.get(name, name)
    return canonical if canonical in TOOL_SPECS else None


def tool_declarations() -> list[dict[str, Any]]:
    return [spec.declaration() for spec in TOOL_SPECS.values()]


# --- runtime ---------------------------------------------------------------------


@dataclass
class ToolRuntime:
    """Executes catalog tools with validate → RBAC → timeout → result-cap ordering."""

    db: Any
    policy: PolicyEngine
    ping: Callable[[], bool] | None = None

    def db_available(self) -> bool:
        if self.db is None:
            return False
        return self.ping() if self.ping is not None else True

    def execute(self, name: str, raw_args: Any, user_ctx: UserContext) -> dict[str, Any]:
        canonical = resolve_tool_name(name)
        if canonical is None:
            return {"status": "error", "code": "UNKNOWN_TOOL", "message": f"Tool '{name}' không có trong catalog."}
        spec = TOOL_SPECS[canonical]
        if not is_agent_enabled():
            return {
                "status": "locked",
                "code": "AGENT_DISABLED",
                "message": "Agent chat đang tắt (AI_AGENT_ENABLED=false).",
            }
        if not self.db_available():
            return {"status": "error", "code": "DB_NOT_CONNECTED", "message": "Không kết nối được cơ sở dữ liệu."}
        try:
            args = spec.args_model.model_validate(raw_args or {})
        except ValidationError as exc:
            return {
                "status": "error",
                "code": "INVALID_ARGS",
                "message": "Tham số không hợp lệ.",
                "details": exc.errors(include_url=False),
            }
        if user_ctx.role not in spec.allowed_roles:
            return {
                "status": "denied",
                "code": "RBAC_DENIED",
                "message": f"Vai trò {user_ctx.role} không được gọi tool {spec.name}.",
            }
        try:
            result = self._call_with_timeout(spec, args, user_ctx)
        except ToolTimeoutError:
            return {"status": "error", "code": "TOOL_TIMEOUT", "message": "Tool quá thời gian cho phép."}
        return self._cap_result(result)

    def _call_with_timeout(self, spec: ToolSpec, args: BaseModel, user_ctx: UserContext) -> dict[str, Any]:
        timeout = max(settings.tool_timeout_ms, 1) / 1000.0
        # P2-4: the `with ThreadPoolExecutor(...)` form calls shutdown(wait=True) on
        # exit, which blocked until the tool finished — so the timeout never fired.
        # A Python thread cannot be killed; stop waiting for it and let it drain.
        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(spec.handler, self, args, user_ctx)
        try:
            return future.result(timeout=timeout)
        except FutureTimeout as exc:
            raise ToolTimeoutError(spec.name) from exc
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    def _cap_result(self, result: dict[str, Any]) -> dict[str, Any]:
        """Truncate oversized list payloads instead of overflowing the prompt/context."""
        capped: dict[str, Any] = dict(result)
        truncated = False
        for key, value in list(capped.items()):
            if isinstance(value, list) and len(value) > settings.max_tool_result_items:
                capped[key] = value[: settings.max_tool_result_items]
                truncated = True
        if truncated:
            capped["truncated"] = True
        return capped


def is_agent_enabled() -> bool:
    """Safety switch kept from the bootstrap phase; integration must set it true."""
    import os

    return os.getenv("AI_AGENT_ENABLED", "false").lower() in ("true", "1")
