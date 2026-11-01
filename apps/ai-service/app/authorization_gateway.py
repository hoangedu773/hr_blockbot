"""V1 transport adapter: no Mongo credential, legacy tool runtime, or raw policy corpus.

The existing provider chain is reused unchanged. Authorization/data projection is
performed by the API on every allowlisted tool request, before provider execution.
Run this ASGI entrypoint for V1; app.main remains a legacy/evaluation implementation.
"""
from __future__ import annotations

import json
import os
import secrets
from urllib.parse import urlsplit

import anyio
import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from app.deadline import remaining_seconds, use_deadline
from app.jev_shadow import analyze, eligible, shadow_mode, unavailable
from app.llm.base import ChatMessage, CompletionOptions, LLMUnavailable
from app.llm.chain import provider_cache

app = FastAPI(title="HR BlockBot authorized transport", docs_url=None, redoc_url=None)


class AuthorizedChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=2000)
    conversationId: str | None = Field(default=None, max_length=200)
    requestId: str = Field(pattern=r"^[a-f0-9-]{36}$")
    delegationToken: str = Field(min_length=32, max_length=4096)
    providerConfig: dict | None = None
    deadlineAtMs: StrictInt | None = None


def _service_key(provided: str | None) -> str:
    expected = (os.getenv("AI_SERVICE_API_KEY") or "").strip()
    if not expected:
        raise HTTPException(503, "Service authentication not configured")
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(401, "Service authentication required")
    return expected


def _gateway_url() -> str:
    origin = (os.getenv("AUTHORIZATION_API_ORIGIN") or "").rstrip("/")
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


@app.post("/api/v1/authorized-chat")
async def authorized_chat(request: AuthorizedChatRequest, x_ai_service_key: str | None = Header(default=None)) -> dict:
    # One deadline includes preflight, analysis, all scoped reads and generation.
    with use_deadline(request.deadlineAtMs):
        try:
            with anyio.fail_after(remaining_seconds(15)):
                return await _authorized_chat(request, x_ai_service_key)
        except TimeoutError:
            raise HTTPException(503, "Request deadline exceeded") from None


async def _authorized_chat(request: AuthorizedChatRequest, x_ai_service_key: str | None) -> dict:
    key = _service_key(x_ai_service_key)
    url = _gateway_url()
    try:
        mode = shadow_mode()
    except ValueError:
        raise HTTPException(503, "Unsupported V1 analysis mode") from None
    analysis = {}
    contexts: dict[str, object] = {}
    # No model-selected identity/filter/projection; all args are a closed schema.
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False, trust_env=False) as client:
        if mode == "SHADOW":
            config = getattr(app.state, "jev_synthetic_mock", None)
            if config is None:
                analysis = {"decisionAnalysis": unavailable("not_configured")}
            elif not eligible(config, request.message):
                analysis = {"decisionAnalysis": unavailable("skipped_data_policy")}
            else:
                # Service authentication alone never authorizes an analysis call.
                # This adds a preflight; the original four reads/checks still run.
                try:
                    preflight = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                        json={"requestId": request.requestId, "tool": "validate_context", "args": {}}, timeout=remaining_seconds(5))
                    if preflight.status_code == 401:
                        raise HTTPException(401, "End-user delegation is no longer valid")
                    if preflight.status_code != 200 or preflight.json().get("result", {}).get("valid") is not True:
                        raise HTTPException(503, "Scoped preflight could not be verified")
                except (httpx.HTTPError, ValueError, AttributeError):
                    raise HTTPException(503, "Scoped preflight unavailable") from None
                analysis = {"decisionAnalysis": await analyze(config, request.message)}
        for tool in ("get_my_profile", "list_projects", "query_policy", "validate_context"):
            try:
                response = await client.post(url, headers={"x-ai-service-key": key, "Authorization": "Bearer " + request.delegationToken},
                    json={"requestId": request.requestId, "tool": tool, "args": {"query": request.message} if tool == "query_policy" else {}}, timeout=remaining_seconds(5))
            except httpx.HTTPError:
                raise HTTPException(503, "Scoped gateway unavailable") from None
            if response.status_code == 401:
                raise HTTPException(401, "End-user delegation is no longer valid")
            if response.status_code == 403 and tool != "validate_context":
                # A missing capability is not authority to fall back to Mongo/static policy.
                continue
            if response.status_code != 200:
                raise HTTPException(503, "Scoped gateway read could not be verified")
            if tool != "validate_context":
                contexts[tool] = response.json().get("result")
    if not contexts or not request.providerConfig:
        return {"reply": "Chưa có dữ liệu được phép hoặc provider phù hợp để trả lời. Chưa có thay đổi dữ liệu nào được thực hiện.",
            "citations": [], "attachments": [], "proposedAction": None, "abstain": True, "degraded": True, "decisionSource": "authorization-v1", **analysis}

    def complete() -> str:
        with use_deadline(request.deadlineAtMs):
            chain = provider_cache.get(request.providerConfig)
            if not chain:
                raise LLMUnavailable([])
            # Neither service credentials nor delegation tokens are ever in messages.
            result = chain.complete([
                ChatMessage("system", "Chỉ trả lời từ dữ liệu được API cho phép dưới đây. Nếu thiếu dữ liệu, nói rõ chưa có; không suy đoán nhân sự khác. Không thực thi thao tác, không tạo link/citation hoặc giả đã ghi dữ liệu.\n" + json.dumps(contexts, ensure_ascii=False)),
                ChatMessage("user", request.message),
            ], CompletionOptions(temperature=0.0, max_tokens=1024))
            return result.text.strip()[:8000]
    try:
        text = await anyio.to_thread.run_sync(complete, abandon_on_cancel=True)
    except LLMUnavailable:
        raise HTTPException(503, "Configured provider unavailable") from None
    if not text:
        raise HTTPException(503, "Provider returned no usable answer")
    # API revalidates the principal and all context receipts before returning output.
    return {"reply": text, "citations": [], "attachments": [], "proposedAction": None, "abstain": False,
        "degraded": False, "decisionSource": "authorization-v1", **analysis,
        **({"conversationId": request.conversationId} if request.conversationId else {})}
