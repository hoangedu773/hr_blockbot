"""V1 transport adapter: no Mongo credential, legacy tool runtime, or raw policy corpus.

The existing provider chain is reused unchanged. Authorization/data projection is
performed by the API on every allowlisted tool request, before provider execution.
Run this ASGI entrypoint for V1; app.main remains a legacy/evaluation implementation.
"""
from __future__ import annotations
import asyncio
import inspect
import json
import os
import re
import secrets
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone, date
from typing import Any, AsyncIterator
from urllib.parse import urlsplit
import anyio
import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from app.deadline import remaining_seconds, use_deadline
from app.jev_shadow import analyze, eligible, shadow_mode, unavailable
from app.jev_live import analyze_live, live_mode_enabled
from app.kpi_analysis import ReviewItem, analyze as analyze_reviews
from app.kpi_analysis import ProposeTargetRequest, propose_target
from app.llm.base import ChatMessage, CompletionOptions, LLMUnavailable, ProviderSafetyBlocked, ProviderTimeout
from app.llm.chain import provider_cache
from app.performance_kpi import SuggestTaskStructureRequest, SummarizeEvaluationRequest, ExplainKpiRequest, suggest_structure, summarize_evaluation, explain_kpi

REVENUE_KPI_TOOLS = frozenset({"get_my_revenue_kpi", "list_my_pending_actions", "get_revenue_kpi_detail", "get_my_tasks"})
CANONICAL_ASSIGNMENT_ID = re.compile(r"(?<![0-9a-f])[0-9a-f]{24}(?![0-9a-f])")
REVENUE_INTENT = re.compile(r"(kpi\s+doanh\s*thu|doanh\s*thu|revenue)", re.IGNORECASE)
PENDING_INTENT = re.compile(r"(việc cần xử lý|việc chờ xử lý|chờ xử lý|chờ xác nhận|cần xử lý|việc nào cần|cần làm gì|pending|nhắc việc)", re.IGNORECASE)
TASKS_INTENT = re.compile(
    r"(nhiệm vụ đang giao|task đang giao|công việc cần nghiệm thu|việc có thang điểm|công việc đang giao|"
    r"(?:task|nhiệm vụ|công việc)[^\n.]{0,40}(của tôi|của em|của mình|được giao|tháng này|chờ nhận|cần nộp))",
    re.IGNORECASE,
)
DETAIL_INTENT = re.compile(r"(chi tiết|detail|xem kpi|assignment)", re.IGNORECASE)
# Lịch: đọc tách khỏi ghi. `đổi ca` trước đây nằm trong nhóm đọc nên chatbot trả lời
# như đã xử lý trong khi chỉ gọi tool đọc — bug hành vi, không phải thiếu tính năng.
SCHEDULE_READ_INTENT = re.compile(
    r"(lịch làm|lịch ca|lịch tuần|lịch trực|lịch của tôi|xem lịch|ca làm|làm ca|ca trực|ca nào|"
    r"ca mấy giờ|ca sáng|ca chiều|ca tối|ca của tôi|có ca|đi làm không|ngày nào tuần này|"
    r"làm (?:những )?ngày nào|những ngày nào)", re.IGNORECASE)
SCHEDULE_REGISTER_INTENT = re.compile(r"(đăng ký ca|đăng kí ca|xin ca|muốn làm ca|chọn ca|đăng ký lịch)", re.IGNORECASE)
SCHEDULE_CHANGE_INTENT = re.compile(r"(đổi ca|nhận ca thay|ca thay|xin nghỉ ca|nhờ người làm ca)", re.IGNORECASE)
SCHEDULE_REVIEW_INTENT = re.compile(r"(duyệt (yêu cầu )?đổi ca|yêu cầu đổi ca nào|xử lý đổi ca|đổi ca nào đang chờ)", re.IGNORECASE)
CANONICAL_WEEK_START = re.compile(r"(?<![0-9])20[0-9]{2}-[0-9]{2}-[0-9]{2}(?![0-9])")
UUID_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
PENDING_PROMPT_RULE = (
    " Quy tắc danh sách việc cần xử lý: nếu list_my_pending_actions trả về rỗng, nói đúng rằng hiện"
    " không còn việc nào cần xử lý. Nếu có mục ACTION_REQUIRED hoặc URGENT, liệt kê tối đa 5 việc"
    " quan trọng nhất kèm hạn chót giờ Việt Nam và gợi ý người dùng hỏi cách xử lý từng việc."
    " Dữ liệu này chỉ để đọc: không nói đã thực hiện, đã ghi hay đã xác nhận gì; mọi thao tác ghi"
    " phải qua quy trình xác nhận trên Web."
)
ACCEPT_INTENT = re.compile(r"(chấp\s*nhận|xác\s*nhận\s*nhận|đồng\s*ý\s*nhận|nhận\s*kpi\s*doanh\s*thu|accept)", re.IGNORECASE)
REFUSE_INTENT = re.compile(r"(từ\s*chối|không\s*nhận|refuse|decline)", re.IGNORECASE)
ADJUSTMENT_INTENT = re.compile(r"(yêu\s*cầu\s*điều\s*chỉnh|điều\s*chỉnh\s*(?:kpi|mục\s*tiêu|chỉ\s*tiêu)|adjustment)", re.IGNORECASE)


app = FastAPI(title="HR BlockBot authorized transport", docs_url=None, redoc_url=None)


@app.post("/api/v1/kpi/propose-target")
async def kpi_propose_target(request: ProposeTargetRequest, x_ai_service_key: str | None = Header(default=None)) -> dict:
    _service_key(x_ai_service_key)
    try:
        with anyio.fail_after(20):
            return await anyio.to_thread.run_sync(lambda: propose_target(request, request.providerConfig), abandon_on_cancel=True)
    except ValueError:
        raise HTTPException(422, "Invalid target range") from None
    except TimeoutError:
        raise HTTPException(503, "Target proposal deadline exceeded") from None


class KpiAnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reviews: list[ReviewItem] = Field(min_length=1, max_length=2)
    providerConfig: dict | None = None


class AuthorizedChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=2000)
    conversationId: str | None = Field(default=None, max_length=200)
    revenueOpenPeriod: str | None = Field(default=None, pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")
    revenueResultAssignmentId: str | None = Field(default=None, pattern=r"^[a-f0-9]{24}$")
    requestId: str = Field(pattern=r"^[a-f0-9-]{36}$")
    delegationToken: str = Field(min_length=32, max_length=4096)
    providerConfig: dict | None = None
    deadlineAtMs: StrictInt | None = None
    authorizationOrigin: str | None = Field(default=None, max_length=500)


def _service_key(provided: str | None) -> str:
    expected = (os.getenv("AI_SERVICE_API_KEY") or "").strip()
    if not expected:
        raise HTTPException(503, "Service authentication not configured")
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(401, "Service authentication required")
    return expected


def _gateway_url(requested_origin: str | None = None) -> str:
    default_origin = (os.getenv("AUTHORIZATION_API_ORIGIN") or "").rstrip("/")
    allowed = {default_origin} | {value.strip().rstrip("/") for value in (os.getenv("AUTHORIZATION_API_ORIGINS") or "").split(",") if value.strip()}
    origin = requested_origin.rstrip("/") if requested_origin else default_origin
    if origin not in allowed:
        raise HTTPException(503, "Scoped gateway origin is not allowlisted")
    parsed = urlsplit(origin)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.path or parsed.query or parsed.fragment or parsed.username:
        raise HTTPException(503, "Scoped gateway origin is not configured")
    return origin + "/api/internal/authorization/tools"


@app.get("/health")
@app.get("/health/live")
def health() -> dict:
    return {"status": "ok", "mode": "authorization-gateway-only"}


@app.get("/health/ready")
async def ready() -> dict:
    url = _gateway_url().removesuffix("/tools") + "/ready"
    key = (os.getenv("AI_SERVICE_API_KEY") or "").strip()
    if not key:
        raise HTTPException(503, "Service authentication not configured")
    try:
        # This is a server-configured internal hop carrying a service credential,
        # not an external provider call. Ambient proxy transports also construct
        # redundant TLS contexts synchronously, starving readiness on Windows.
        # Direct routing keeps TLS verification on and never follows redirects.
        async with httpx.AsyncClient(timeout=3.0, follow_redirects=False, trust_env=False) as client:
            response = await client.get(url, headers={"x-ai-service-key": key})
        if response.status_code != 200 or response.json() != {"status": "ok", "mode": "authorization-gateway-only"}:
            raise HTTPException(503, "Scoped gateway dependency is not ready")
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Scoped gateway dependency unavailable") from None
    return health()


@app.post("/api/v1/chat")
@app.post("/api/v1/rag/query")
def retired_legacy_path() -> None:
    raise HTTPException(403, "Scoped authorization gateway required; legacy direct reads are not mounted in V1")


@app.post("/api/v1/kpi/analyze-review")
async def kpi_analyze_review(request: KpiAnalyzeRequest, x_ai_service_key: str | None = Header(default=None)) -> dict:
    _service_key(x_ai_service_key)
    try:
        with anyio.fail_after(20):
            return await anyio.to_thread.run_sync(lambda: analyze_reviews(request.reviews, request.providerConfig), abandon_on_cancel=True)
    except TimeoutError:
        raise HTTPException(503, "Review analysis deadline exceeded") from None


@app.post("/api/v1/authorized-chat")
async def authorized_chat(request: AuthorizedChatRequest, x_ai_service_key: str | None = Header(default=None)) -> dict:
    # One deadline includes preflight, analysis, all scoped reads and generation.
    with use_deadline(request.deadlineAtMs):
        try:
            with anyio.fail_after(remaining_seconds(15)):
                return await _authorized_chat(request, x_ai_service_key)
        except TimeoutError:
            raise HTTPException(503, "Request deadline exceeded") from None

@app.post("/api/v1/authorized-chat/stream")
async def authorized_chat_stream(
    request: AuthorizedChatRequest,
    x_ai_service_key: str | None = Header(default=None),
) -> StreamingResponse:
    key = _service_key(x_ai_service_key)

    async def event_generator() -> AsyncIterator[str]:
        with use_deadline(request.deadlineAtMs):
            try:
                with anyio.fail_after(remaining_seconds(15.0)):
                    prepared = await _prepare_chat(request, key)
                    if isinstance(prepared, dict):
                        yield f"event: done\ndata: {json.dumps({'result': prepared}, ensure_ascii=False)}\n\n"
                        return

                    chain = provider_cache.get(request.providerConfig)
                    if not chain:
                        raise LLMUnavailable([])

                    MAX_REPLY_CHARS = 8000
                    chunks: list[str] = []
                    total_len = 0
                    stream_iter = chain.stream(prepared.messages, CompletionOptions(temperature=0.0, max_tokens=1024))
                    try:
                        async for delta in stream_iter:
                            if delta and total_len < MAX_REPLY_CHARS:
                                allowed = MAX_REPLY_CHARS - total_len
                                emit_delta = delta[:allowed]
                                chunks.append(emit_delta)
                                total_len += len(emit_delta)
                                yield f"event: delta\ndata: {json.dumps({'delta': emit_delta}, ensure_ascii=False)}\n\n"
                    finally:
                        if hasattr(stream_iter, "aclose"):
                            active_exc = sys.exc_info()[1]
                            try:
                                await stream_iter.aclose()
                            except (asyncio.CancelledError, GeneratorExit):
                                raise
                            except Exception:
                                if active_exc is None:
                                    raise

                    text = "".join(chunks).strip()
                    if not text:
                        raise HTTPException(503, "Provider returned no usable answer")

                    result = _package_result(text, prepared.analysis, prepared.mode, prepared.live_ok, request.conversationId)
                    yield f"event: done\ndata: {json.dumps({'result': result}, ensure_ascii=False)}\n\n"
            except ProviderSafetyBlocked:
                yield f"event: error\ndata: {json.dumps({'code': 'SAFETY_BLOCKED'})}\n\n"
            except (TimeoutError, ProviderTimeout):
                yield f"event: error\ndata: {json.dumps({'code': 'LLM_TIMEOUT'})}\n\n"
            except LLMUnavailable:
                yield f"event: error\ndata: {json.dumps({'code': 'LLM_UNAVAILABLE'})}\n\n"
            except HTTPException as exc:
                code = "UNAUTHENTICATED" if exc.status_code == 401 else "UNAVAILABLE"
                yield f"event: error\ndata: {json.dumps({'code': code})}\n\n"
            except (asyncio.CancelledError, GeneratorExit):
                raise
            except Exception:
                yield f"event: error\ndata: {json.dumps({'code': 'INTERNAL_ERROR'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@dataclass
class PreparedChatContext:
    messages: list[ChatMessage]
    analysis: dict
    mode: str
    live_ok: bool


def _package_result(
    text: str,
    analysis: dict,
    mode: str,
    live_ok: bool,
    conversation_id: str | None,
) -> dict:
    return {
        "reply": text,
        "citations": [],
        "attachments": [],
        "proposedAction": None,
        "abstain": False,
        "degraded": False if mode in ("OFF", "SHADOW") else not live_ok,
        "decisionSource": analysis["decisionAnalysis"]["source"] if live_ok else "authorization-v1",
        **analysis,
        **({"conversationId": conversation_id} if conversation_id else {}),
    }


async def _authorized_chat(request: AuthorizedChatRequest, x_ai_service_key: str | None) -> dict:
    key = _service_key(x_ai_service_key)
    prepared = await _prepare_chat(request, key)
    if isinstance(prepared, dict):
        return prepared

    def complete() -> str:
        with use_deadline(request.deadlineAtMs):
            chain = provider_cache.get(request.providerConfig)
            if not chain:
                raise LLMUnavailable([])
            result = chain.complete(prepared.messages, CompletionOptions(temperature=0.0, max_tokens=1024))
            return result.text.strip()[:8000]

    try:
        text = await anyio.to_thread.run_sync(complete, abandon_on_cancel=True)
    except ProviderSafetyBlocked:
        raise HTTPException(503, {"code": "SAFETY_BLOCKED"}) from None
    except LLMUnavailable:
        raise HTTPException(503, "Configured provider unavailable") from None
    if not text:
        raise HTTPException(503, "Provider returned no usable answer")

    return _package_result(text, prepared.analysis, prepared.mode, prepared.live_ok, request.conversationId)


async def _prepare_chat(request: AuthorizedChatRequest, key: str) -> dict | PreparedChatContext:
    url = _gateway_url(request.authorizationOrigin)
    try:
        raw_mode = (os.getenv("JEV_V1_MODE") or "OFF").strip().upper()
        mode = "LIVE" if live_mode_enabled() else shadow_mode()
        if raw_mode not in ("OFF", "SHADOW", "LIVE"):
            raise ValueError("Unsupported V1 analysis mode")
    except ValueError:
        raise HTTPException(503, "Unsupported V1 analysis mode") from None
    analysis = {}
    contexts: dict[str, object] = {}
    # No model-selected identity/filter/projection; all args are a closed schema.
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
        if request.revenueOpenPeriod:
            # The Node API binds this read tool to the requested month. Only the
            # authenticated client can execute the server-owned proposal later.
            try:
                response = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                    json={"requestId": request.requestId, "tool": "preview_revenue_period_open", "args": {"period": request.revenueOpenPeriod}},
                    timeout=remaining_seconds(12))
            except httpx.HTTPError:
                raise HTTPException(503, "Revenue preview unavailable") from None
            if response.status_code == 401:
                raise HTTPException(401, "End-user delegation is no longer valid")
            replies = {
                200: "Đã lập bản xem trước. Hãy kiểm tra kế hoạch rồi xác nhận.",
                403: "Bạn chưa có quyền mở kỳ KPI doanh thu.",
                404: "Chưa có kỳ này. Hãy tạo và cấu hình kỳ KPI doanh thu trên Web.",
                409: "Kỳ này chưa thể mở hoặc tạo thêm bản nháp. Hãy kiểm tra trạng thái trên Web.",
            }
            if response.status_code not in replies:
                raise HTTPException(503, "Revenue preview unavailable")
            return {"reply": replies[response.status_code], "citations": [], "attachments": [], "proposedAction": None, "abstain": response.status_code != 200}
        if request.revenueResultAssignmentId:
            # Read-only scoped tool bound to a canonical assignmentId supplied by
            # the API client. The model never selects an identity, id, or scope.
            try:
                response = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                    json={"requestId": request.requestId, "tool": "get_revenue_kpi_result", "args": {"assignmentId": request.revenueResultAssignmentId}},
                    timeout=remaining_seconds(12))
            except httpx.HTTPError:
                raise HTTPException(503, "Revenue result unavailable") from None
            if response.status_code == 401:
                raise HTTPException(401, "End-user delegation is no longer valid")
            replies = {
                200: "Đã xem kết quả KPI doanh thu của assignment này.",
                403: "Bạn không có quyền xem kết quả KPI doanh thu của assignment này.",
                404: "Không tìm thấy assignment hoặc kết quả KPI này trong phạm vi của bạn.",
                409: "Assignment đang thay đổi. Hãy thử lại sau.",
            }
            if response.status_code not in replies:
                raise HTTPException(503, "Revenue result unavailable")
            return {"reply": replies[response.status_code], "citations": [], "attachments": [], "proposedAction": None, "abstain": response.status_code != 200}
        if REVENUE_INTENT.search(request.message):
            assignment_id = CANONICAL_ASSIGNMENT_ID.search(request.message)
            mutation_action = None
            if ADJUSTMENT_INTENT.search(request.message):
                mutation_action = "adjustment-request"
            elif REFUSE_INTENT.search(request.message):
                mutation_action = "refuse"
            elif ACCEPT_INTENT.search(request.message):
                mutation_action = "accept"
            if mutation_action:
                if not assignment_id:
                    return {"reply": "Bạn cho tôi mã assignment (24 ký tự hex) của KPI doanh thu cần " + (
                        "yêu cầu điều chỉnh" if mutation_action == "adjustment-request" else "chấp nhận hoặc từ chối") + " nhé. Tôi sẽ không đoán mã.",
                        "citations": [], "attachments": [], "proposedAction": None, "abstain": False,
                        "decisionSource": "authorization-v1"}
                try:
                    response = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                        json={"requestId": request.requestId, "tool": "preview_revenue_assignment_action",
                              "args": {"assignmentId": assignment_id.group(0), "action": mutation_action}},
                        timeout=remaining_seconds(12))
                except httpx.HTTPError:
                    raise HTTPException(503, "Revenue proposal unavailable") from None
                if response.status_code == 401:
                    raise HTTPException(401, "End-user delegation is no longer valid")
                replies = {
                    200: "Đã lập đề xuất thao tác. Hãy xem lại nội dung rồi xác nhận trên hệ thống.",
                    403: "Bạn chưa có quyền thực hiện thao tác này trên KPI doanh thu.",
                    404: "Không tìm thấy assignment này hoặc bạn không có quyền xem. Hãy kiểm tra lại mã.",
                    409: "KPI này đang ở trạng thái không thể thực hiện thao tác. Hãy kiểm tra trên Web.",
                }
                if response.status_code not in replies:
                    raise HTTPException(503, "Revenue proposal unavailable")
                proposal = response.json().get("result") if response.status_code == 200 else None
                return {"reply": replies[response.status_code],
                        "citations": [], "attachments": [],
                        "proposedAction": proposal if isinstance(proposal, dict) and proposal.get("requiresConfirmation") is True and proposal.get("executed") is not True else None,
                        "abstain": response.status_code != 200, "degraded": False, "decisionSource": "authorization-v1"}
        elif re.search(r"(nhận|chấp\s*nhận|accept).*(nhiệm\s*vụ|công\s*việc|task)", request.message, re.IGNORECASE):
            task_id = CANONICAL_ASSIGNMENT_ID.search(request.message)
            if task_id:
                try:
                    response = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                        json={"requestId": request.requestId, "tool": "preview_performance_kpi_action",
                              "args": {"domain": "task", "kind": "task.accept", "target": {"taskId": task_id.group(0)}, "content": {}}},
                        timeout=remaining_seconds(12))
                except httpx.HTTPError:
                    raise HTTPException(503, "Performance task proposal unavailable") from None
                if response.status_code == 401:
                    raise HTTPException(401, "End-user delegation is no longer valid")
                replies = {
                    200: "Đã lập bản xem trước nhận nhiệm vụ. Hãy kiểm tra nội dung rồi xác nhận trên hệ thống.",
                    403: "Bạn chưa có quyền nhận nhiệm vụ này.",
                    404: "Không tìm thấy nhiệm vụ này trong phạm vi của bạn.",
                    409: "Nhiệm vụ này đang ở trạng thái không thể nhận. Hãy kiểm tra trên Web.",
                }
                if response.status_code not in replies:
                    raise HTTPException(503, "Performance task proposal unavailable")
                proposal = response.json().get("result") if response.status_code == 200 else None
                return {"reply": replies[response.status_code],
                        "citations": [], "attachments": [],
                        "proposedAction": proposal if isinstance(proposal, dict) and proposal.get("requiresConfirmation") is True and proposal.get("executed") is not True else None,
                        "abstain": response.status_code != 200, "degraded": False, "decisionSource": "authorization-v1"}
        config = None
        if mode == "SHADOW":
            config = getattr(app.state, "jev_synthetic_mock", None)
            if config is None:
                analysis = {"decisionAnalysis": unavailable("not_configured")}
            elif not eligible(config, request.message):
                analysis = {"decisionAnalysis": unavailable("skipped_data_policy")}
            else:
                # Service authentication alone never authorizes an analysis call.
                # This adds a preflight; the original reads still run.
                try:
                    preflight = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                        json={"requestId": request.requestId, "tool": "validate_context", "args": {}}, timeout=remaining_seconds(5))
                    if preflight.status_code == 401:
                        raise HTTPException(401, "End-user delegation is no longer valid")
                    if preflight.status_code != 200 or preflight.json().get("result", {}).get("valid") is not True:
                        raise HTTPException(503, "Scoped preflight could not be verified")
                except HTTPException:
                    raise
                except (httpx.HTTPError, ValueError, AttributeError):
                    raise HTTPException(503, "Scoped preflight unavailable") from None
                analysis = {"decisionAnalysis": await analyze(config, request.message)}
        elif mode == "LIVE":
            # The same scoped preflight gates live Jev. The model sees only the
            # user's message after API authorization; it never receives context,
            # credentials, delegation tokens, or tool access.
            try:
                preflight = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                    json={"requestId": request.requestId, "tool": "validate_context", "args": {}}, timeout=remaining_seconds(5))
                if preflight.status_code == 401:
                    raise HTTPException(401, "End-user delegation is no longer valid")
                if preflight.status_code != 200 or preflight.json().get("result", {}).get("valid") is not True:
                    raise HTTPException(503, "Scoped preflight could not be verified")
            except HTTPException:
                raise
            except (httpx.HTTPError, ValueError, AttributeError):
                raise HTTPException(503, "Scoped preflight unavailable") from None
        calls = [(tool, {"query": request.message} if tool == "query_policy" else {})
                 for tool in ("get_my_profile", "list_projects", "query_policy")]
        needs_assignment_id = False
        needs_schedule_context = False
        period = requested_kpi_period(request.message)
        if re.search(r"(kpi|điểm|đánh giá|hiệu suất|xếp hạng)", request.message, re.IGNORECASE):
            calls.append(("get_my_kpi", {"period": period} if period else {}))
            if re.search(r"(phòng ban|cửa hàng|đội|nhóm|toàn bộ|tổng hợp)", request.message, re.IGNORECASE):
                calls.append(("get_department_kpi", {"period": period} if period else {}))
        if re.search(r"(hạn|deadline|sắp hết|quá hạn|nhắc|tiến độ|nộp báo cáo)", request.message, re.IGNORECASE):
            calls.append(("get_upcoming_deadlines", {}))
        if SCHEDULE_REGISTER_INTENT.search(request.message):
            week = CANONICAL_WEEK_START.search(request.message)
            shift = CANONICAL_ASSIGNMENT_ID.search(request.message)
            if not week or not shift:
                needs_schedule_context = True
            else:
                calls.append(("preview_schedule_registration", {"weekStart": week.group(0), "slot": {
                    "date": week.group(0), "shiftId": shift.group(0), "shiftVersion": 1}}))
        elif SCHEDULE_CHANGE_INTENT.search(request.message):
            week = CANONICAL_WEEK_START.search(request.message)
            assignment = UUID_ID.search(request.message)
            if not week or not assignment:
                needs_schedule_context = True
            else:
                calls.append(("preview_schedule_change", {"weekId": week.group(0), "scheduleAssignmentId": assignment.group(0),
                    "arrangement": "MANAGER", "changeKind": "COVER", "reason": "Đổi ca qua trợ lý chat"}))
        elif SCHEDULE_REVIEW_INTENT.search(request.message):
            change = UUID_ID.search(request.message)
            if not change:
                needs_schedule_context = True
            else:
                calls.append(("preview_schedule_change_decision", {"weekId": "", "changeId": change.group(0), "scheduleAction": "APPROVE"}))
        elif SCHEDULE_READ_INTENT.search(request.message):
            local_day = datetime.now(timezone(timedelta(hours=7))).date()
            start = local_day
            end = start + timedelta(days=6)
            explicit = re.findall(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}", request.message)
            try:
                if explicit:
                    start = date.fromisoformat(explicit[0])
                    end = date.fromisoformat(explicit[1]) if len(explicit) > 1 else start
                elif re.search(r"tuần sau", request.message, re.IGNORECASE):
                    start = local_day - timedelta(days=local_day.weekday()) + timedelta(days=7)
                    end = start + timedelta(days=6)
                elif re.search(r"tuần này", request.message, re.IGNORECASE):
                    start = local_day - timedelta(days=local_day.weekday())
                    end = start + timedelta(days=6)
                elif re.search(r"(ngày mai|mai (?:tôi|em|mình|làm)|tomorrow)", request.message, re.IGNORECASE):
                    start = end = local_day + timedelta(days=1)
                elif re.search(r"(hôm nay|today)", request.message, re.IGNORECASE):
                    start = end = local_day
            except ValueError:
                raise HTTPException(400, "Ngày lịch không hợp lệ") from None
            calls.append(("get_my_schedule", {"from": start.isoformat(), "to": end.isoformat()}))
        if REVENUE_INTENT.search(request.message):
            period = requested_kpi_period(request.message)
            if PENDING_INTENT.search(request.message):
                calls.append(("list_my_pending_actions", {"limit": 5}))
            else:
                if TASKS_INTENT.search(request.message):
                    calls.append(("get_my_tasks", {"period": period} if period else {}))
                if DETAIL_INTENT.search(request.message):
                    assignment_id = CANONICAL_ASSIGNMENT_ID.search(request.message)
                    if assignment_id:
                        detail_args = {"assignmentId": assignment_id.group(0)}
                        if period:
                            detail_args["period"] = period
                        calls.append(("get_revenue_kpi_detail", detail_args))
                    else:
                        needs_assignment_id = True
                if not TASKS_INTENT.search(request.message) and not DETAIL_INTENT.search(request.message):
                    calls.append(("get_my_revenue_kpi", {"period": period} if period else {}))
        elif PENDING_INTENT.search(request.message):
            calls.append(("list_my_pending_actions", {"limit": 5}))
            if TASKS_INTENT.search(request.message):
                period = requested_kpi_period(request.message)
                calls.append(("get_my_tasks", {"period": period} if period else {}))
        elif TASKS_INTENT.search(request.message):
            period = requested_kpi_period(request.message)
            calls.append(("get_my_tasks", {"period": period} if period else {}))
        _SKIPPED = object()

        async def _fetch_tool(tool: str, args: dict[str, Any], sem: asyncio.Semaphore) -> tuple[str, Any]:
            async with sem:
                try:
                    response = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                        json={"requestId": request.requestId, "tool": tool, "args": args}, timeout=remaining_seconds(5))
                except httpx.HTTPError:
                    raise HTTPException(503, "Scoped gateway unavailable") from None
                if response.status_code == 401:
                    raise HTTPException(401, "End-user delegation is no longer valid")
                if response.status_code == 403:
                    err_code = None
                    try:
                        err_code = response.json().get("error", {}).get("code")
                    except Exception:
                        pass
                    if err_code == "RBAC_DENIED":
                        return (tool, _SKIPPED)
                    raise HTTPException(503, "Scoped gateway read could not be verified")
                if response.status_code != 200:
                    raise HTTPException(503, "Scoped gateway read could not be verified")
                return (tool, response.json().get("result"))

        async def _run_jev() -> dict[str, Any]:
            if mode == "LIVE":
                res = analyze_live(request.message, request.deadlineAtMs)
                if inspect.isawaitable(res):
                    res = await res
                return {"decisionAnalysis": res}
            return {}

        should_run_jev = mode == "LIVE"
        sem = asyncio.Semaphore(4)
        read_tasks = [asyncio.create_task(_fetch_tool(tool, args, sem)) for tool, args in calls]
        jev_task = asyncio.create_task(_run_jev()) if should_run_jev else None

        active_tasks = [*read_tasks]
        if jev_task is not None:
            active_tasks.append(jev_task)

        try:
            results = await asyncio.gather(*read_tasks)
            if jev_task is not None:
                analysis = await jev_task
        except BaseException:
            for t in active_tasks:
                if not t.done():
                    t.cancel()
            await asyncio.gather(*active_tasks, return_exceptions=True)
            raise

        results_map = dict(results)
        for tool, _ in calls:
            res = results_map.get(tool)
            if res is not _SKIPPED and res is not None:
                contexts[tool] = res

        # Barrier: validate_context runs alone AFTER all reads complete and BEFORE provider
        try:
            barrier = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                json={"requestId": request.requestId, "tool": "validate_context", "args": {}}, timeout=remaining_seconds(5))
        except httpx.HTTPError:
            raise HTTPException(503, "Scoped gateway unavailable") from None
        if barrier.status_code == 401:
            raise HTTPException(401, "End-user delegation is no longer valid")
        if barrier.status_code != 200 or barrier.json().get("result", {}).get("valid") is not True:
            raise HTTPException(503, "Scoped gateway read could not be verified")
    performance = contexts.get("get_my_kpi")
    revenue_read = REVENUE_KPI_TOOLS & contexts.keys()
    pending_intent = PENDING_INTENT.search(request.message) is not None or needs_assignment_id
    department_read = "get_department_kpi" in contexts
    policy_intent = re.search(r"(quy định|quy chế|quy trình|hướng dẫn|cách tính|công thức)", request.message, re.IGNORECASE) is not None
    if isinstance(performance, dict) and performance.get("kind") == "performance_kpi" and not revenue_read and not pending_intent and not department_read and not policy_intent:
        # Grounded API explanation, same API/audit as Web. No model rescores it.
        return {"reply": str(performance.get("summary", ""))[:16000] + "\n" + "\n".join(performance.get("advice", [])),
                "citations": [], "attachments": [], "proposedAction": None, "abstain": False,
                "degraded": False, "decisionSource": "stored-performance-evidence-v2", **analysis}
    if needs_schedule_context:
        schedule_context_note = (
            " Người dùng muốn thao tác trên lịch nhưng câu không kèm mã tuần/ca. Trả lời rằng hãy mở màn"
            " Lịch, chọn đúng tuần và ca, rồi bấm nút trợ lý ở đó — không được tự đoán ca hoặc nói đã đổi."
        )
    else:
        schedule_context_note = ""
    if needs_assignment_id:
        return {"reply": "Bạn cho tôi mã assignment (24 ký tự hex) của KPI doanh thu cần xem chi tiết nhé. Tôi sẽ không đoán mã.",
            "citations": [], "attachments": [], "proposedAction": None, "abstain": False,
            "degraded": False, "decisionSource": "authorization-v1", **analysis}
    if not contexts or not request.providerConfig:
        return {"reply": "Chưa có dữ liệu được phép hoặc provider phù hợp để trả lời. Chưa có thay đổi dữ liệu nào được thực hiện.",
            "citations": [], "attachments": [], "proposedAction": None, "abstain": True, "degraded": True,
            "decisionSource": analysis["decisionAnalysis"]["source"] if mode == "LIVE" and analysis.get("decisionAnalysis", {}).get("status") == "ok" else "authorization-v1",
            **analysis}

    decision_hint = json.dumps(analysis.get("decisionAnalysis", {}), ensure_ascii=False) if mode == "LIVE" else "{}"
    if mode == "LIVE":
        system_prompt = (
            "Hôm nay là " + datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")
            + ". Chỉ trả lời từ dữ liệu được API cho phép dưới đây. Nếu thiếu dữ liệu, nói rõ chưa có; không suy đoán nhân sự khác. Không thực thi thao tác, không tạo link/citation hoặc giả đã ghi dữ liệu. Khi trả lời lịch làm, ghi rõ ngày và giờ Việt Nam từ dữ liệu; chỉ dùng ca đã công bố, không suy giờ từ mã ca. Nếu sourceKind là DEMO_RANDOM, phải nói rõ đó là lịch mẫu ngẫu nhiên để test, không xác nhận đã đi làm. LĐ là đứng trước quán vẫy/đón khách."
            + " Jev chỉ là tín hiệu phân loại đã được xác thực; không phải quyền truy cập và không tự phê duyệt thao tác. Nếu tín hiệu Jev cho biết cần quản lý duyệt, chỉ giải thích rằng thao tác cần quy trình xác nhận, không tự thực hiện."
            + PENDING_PROMPT_RULE + schedule_context_note
            + "\n" + json.dumps(contexts, ensure_ascii=False) + "\nJev decision metadata: " + decision_hint
        )
    else:
        system_prompt = (
            "Hôm nay là " + datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")
            + ". Chỉ trả lời từ dữ liệu được API cho phép dưới đây. Nếu thiếu dữ liệu, nói rõ chưa có; không suy đoán nhân sự khác. Không thực thi thao tác, không tạo link/citation hoặc giả đã ghi dữ liệu. Khi trả lời lịch làm, ghi rõ ngày và giờ Việt Nam từ dữ liệu; chỉ dùng ca đã công bố, không suy giờ từ mã ca. Nếu sourceKind là DEMO_RANDOM, phải nói rõ đó là lịch mẫu ngẫu nhiên để test, không xác nhận đã đi làm. LĐ là đứng trước quán vẫy/đón khách." + PENDING_PROMPT_RULE
            + schedule_context_note
            + "\n" + json.dumps(contexts, ensure_ascii=False)
        )
    messages = [
        ChatMessage("system", system_prompt),
        ChatMessage("user", request.message),
    ]
    decision_status = analysis.get("decisionAnalysis", {}).get("status")
    live_ok = mode == "LIVE" and decision_status == "ok"
    return PreparedChatContext(messages=messages, analysis=analysis, mode=mode, live_ok=live_ok)


async def _performance_advice(request, function, key):
    _service_key(key)
    try:
        with anyio.fail_after(20):
            return await anyio.to_thread.run_sync(lambda: function(request), abandon_on_cancel=True)
    except TimeoutError:
        raise HTTPException(503, "Performance advice deadline exceeded") from None


@app.post("/api/v1/kpi/suggest-task-structure")
async def performance_structure(request: SuggestTaskStructureRequest, x_ai_service_key: str | None = Header(default=None)):
    return await _performance_advice(request, suggest_structure, x_ai_service_key)


@app.post("/api/v1/kpi/summarize-evaluation")
async def performance_summary(request: SummarizeEvaluationRequest, x_ai_service_key: str | None = Header(default=None)):
    return await _performance_advice(request, summarize_evaluation, x_ai_service_key)


@app.post("/api/v1/kpi/explain")
async def performance_explain(request: ExplainKpiRequest, x_ai_service_key: str | None = Header(default=None)):
    return await _performance_advice(request, explain_kpi, x_ai_service_key)


def requested_kpi_period(message: str) -> str | None:
    # Longest month alternative first: 10/11/12 must never become January.
    forward = re.search(r"\b(20[0-9]{2})[-/](1[0-2]|0?[1-9])(?![0-9])", message)
    if forward:
        return forward.group(1) + "-" + forward.group(2).zfill(2)
    reverse = re.search(r"(?:tháng\s*)?(1[0-2]|0?[1-9])(?:[/.-]|\s+năm\s+)(20[0-9]{2})(?![0-9])", message, re.IGNORECASE)
    return reverse.group(2) + "-" + reverse.group(1).zfill(2) if reverse else None
