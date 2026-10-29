"""FastAPI surface for the AI service.

Endpoints:
- `GET  /health`, `/health/live`, `/health/ready` — honest probes.
- `POST /api/v1/rag/query` — retrieval + optional grounded answer (eval/CLI path;
  degraded-structured when no provider config is supplied).
- `POST /api/v1/chat` — Agent Loop (intent → tool/policy) used by `apps/api`.

Internal auth: `x-ai-service-key` compared against `AI_SERVICE_API_KEY`. The
service fails closed (503) when that variable is unset.
The LLM provider config arrives per request (ADR-017) and is cached by
`configVersion` for 60s; it is never logged or persisted.
"""

from __future__ import annotations

import logging
import os
import secrets
from typing import Any, Literal, Optional

from fastapi import FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from app.agent.jev_gateway import default_chain

from app.agent.loop import AgentLoop, AgentTurn
from app.agent.tools import TOOL_SPECS, ToolRuntime, UserContext, is_agent_enabled
from app.config import settings
from app.db import db_client
from app.llm.base import LLMUnavailable
from app.llm.chain import ProviderChain, provider_cache
from app.llm.fake import hashing_embed
from app.rag.answer import answer_policy
from app.rag.corpus import load_db_chunks
from app.rag.policy_engine import PolicyEngine, policy_engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai.api")

app = FastAPI(
    title="HR BlockBot AI Service",
    description="Jev AI typed decisions + in-context policy cho chatbot Guta Cafe",
    version="2.0.0",
)

def _cors_origins() -> list[str]:
    """Explicit allowlist. `*` with credentials lets any site replay a user's cookies.

    The service is called server-to-server (`apps/api`), so a wide browser origin
    list buys nothing; default to the local dev origins only.
    """
    raw = (os.getenv("CORS_ALLOW_ORIGINS") or "").strip()
    if not raw:
        return ["http://localhost:5173", "http://localhost:3001"]
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    if "*" in origins:
        raise RuntimeError(
            "CORS_ALLOW_ORIGINS='*' is not allowed with credentials; list origins explicitly."
        )
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- schemas ---------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=settings.request_max_chars, pattern=r"\S")
    conversationId: Optional[str] = None
    userContext: dict[str, Any] = Field(default_factory=dict)
    # ADR-017: {"configVersion": n, "providers": [{id,type,model,baseUrl,apiKey,...}]}
    providerConfig: Optional[dict[str, Any]] = None


class RagQueryRequest(BaseModel):
    question: str = Field(min_length=1)
    topK: Optional[int] = Field(default=None, ge=1, le=20)
    retriever: Optional[Literal["lexical", "dense", "hybrid"]] = None
    scope: Optional[dict[str, Any]] = None
    providerConfig: Optional[dict[str, Any]] = None


# --- helpers ---------------------------------------------------------------------


def _verify_service_key(x_ai_service_key: Optional[str]) -> None:
    expected = (settings.ai_service_api_key or "").strip()
    if expected == "":
        # Fail-closed: an unconfigured key must never mean "trust every caller".
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "SERVICE_KEY_NOT_CONFIGURED",
                "message": "AI_SERVICE_API_KEY is not configured; refusing all requests",
            },
        )
    provided = (x_ai_service_key or "").strip()
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "invalid or missing x-ai-service-key"},
        )


def _chain_for(payload: Optional[dict[str, Any]]) -> ProviderChain | None:
    if not payload:
        return None
    return provider_cache.get(payload)


def _llm_unavailable_response(exc: LLMUnavailable) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "error": {
                "code": "LLM_UNAVAILABLE",
                "message": "No configured LLM provider could answer.",
                "retryable": True,
                "providers": exc.errors,
            },
            "degraded": "degraded-structured",
        },
    )


def _build_policy_engine(kind: str, chain: ProviderChain | None) -> PolicyEngine:
    """Fresh engine per request; reads `policies` read-only and never writes it.

    Dense retrieval needs query/corpus embeddings from the SAME model as ingest. When
    the corpus has no embeddings yet (ingest pending) or is empty, the retriever is
    downgraded to `lexical` (the documented rollback path) instead of calling an
    embedding endpoint that may not exist on the configured provider.
    """
    db = None
    chunks = []
    if db_client.ping() and db_client.db is not None:
        db = db_client.db
        chunks = load_db_chunks(db.policies)
    effective_kind = kind
    if kind in ("dense", "hybrid"):
        if not chunks:
            effective_kind = "lexical"
        elif not all(chunk.embedding for chunk in chunks) and chain is None:
            effective_kind = "lexical"
    embedder = None
    if chain is not None and chain and effective_kind in ("dense", "hybrid"):
        def safe_embed(texts: list[str]) -> list[list[float]]:
            try:
                return chain.embed(texts).vectors
            except Exception as exc:
                logger.warning("Embedding provider call failed (%s); falling back to hashing embedder", exc)
                return [hashing_embed(t, settings.embedding_dim) for t in texts]

        embedder = safe_embed
    engine = PolicyEngine(chunks=chunks or None, retriever_kind=effective_kind, embedder=embedder)
    if db is not None and settings.vector_index_name and effective_kind in ("dense", "hybrid"):
        engine.configure_retrieval(collection=db.policies, index_name=settings.vector_index_name)
    return engine


# --- health probes ---------------------------------------------------------------


@app.get("/health")
def health_check() -> dict[str, Any]:
    """Liveness + readiness with an honest DB ping and vector-index capability."""
    db_connected = db_client.ping()
    # In-context chat has no vector-index dependency or index-readiness probe.
    return {
        "status": "ok" if db_connected else "degraded",
        "service": "ai-service",
        "version": "2.0.0",
        "liveness": "alive",
        "readiness": "ready" if db_connected else "not_ready",
        "database": {
            "status": "connected" if db_connected else "disconnected",
            "name": "hr_bot" if db_connected else None,
        },
        "rag_engine": {
            "status": "active" if db_connected else "degraded",
            "mode": "in_context_policy",
            "default_retriever": None,
            "vector_search": "NOT_REQUIRED",
            "vector_search_detail": "Chat uses in-context knowledge without embeddings or BM25.",
        },
        "agent": {
            "status": "enabled" if is_agent_enabled() else "locked",
            "agent_enabled": is_agent_enabled(),
            "maxSteps": settings.max_steps,
            "tools": len(TOOL_SPECS),
        },
        "providers": {
            # Never report provider ids/keys from here: config arrives per request.
            "cacheTtlSeconds": settings.provider_cache_ttl_seconds,
            "cachedChains": len(provider_cache._entries),  # noqa: SLF001 - internal diagnostics
        },
    }


@app.get("/health/live")
def liveness_probe() -> dict[str, str]:
    return {"status": "alive"}


@app.get("/health/ready")
def readiness_probe(response: Response) -> dict[str, Any]:
    if not db_client.ping():
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready", "database": "disconnected"}
    return {"status": "ready", "database": "connected"}


# --- endpoints -------------------------------------------------------------------


@app.post("/api/v1/rag/query")
def query_policy(
    req: RagQueryRequest,
    x_ai_service_key: Optional[str] = Header(default=None, alias="x-ai-service-key"),
):
    """Retrieval + grounded answer for eval/CLI (no provider -> degraded-structured)."""
    _verify_service_key(x_ai_service_key)
    kind = req.retriever or settings.default_retriever
    chain = _chain_for(req.providerConfig)
    try:
        engine = _build_policy_engine(kind, chain)
        retrieval = engine.retrieve(req.question, k=req.topK, scope=req.scope)
        answer = answer_policy(
            req.question,
            retrieval,
            chain,
            strict_provider=bool(req.providerConfig),
        )
    except LLMUnavailable as exc:
        return _llm_unavailable_response(exc)
    payload = answer.as_dict()
    payload["hits"] = [hit.as_dict() for hit in retrieval.hits]
    payload["retrieval"] = {
        "retriever": retrieval.retriever,
        "abstained": retrieval.abstained,
        "maxEvidence": round(retrieval.max_evidence, 6),
        "reason": retrieval.reason,
    }
    return payload


@app.post("/api/v1/chat")
def chat(
    req: ChatRequest,
    x_ai_service_key: Optional[str] = Header(default=None, alias="x-ai-service-key"),
):
    """Agent loop endpoint consumed by `apps/api` (replaces the old 403 `/agent/chat`)."""
    _verify_service_key(x_ai_service_key)
    if not is_agent_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "AGENT_DISABLED",
                "message": "Agent chat is disabled. Set AI_AGENT_ENABLED=true on the AI service.",
            },
        )
    chain = _chain_for(req.providerConfig) if req.providerConfig is not None else default_chain()
    if not chain:
        return _llm_unavailable_response(
            LLMUnavailable([{"providerId": "none", "code": "LLM_UNAVAILABLE"}])
        )
    try:
        user_ctx = UserContext.model_validate(req.userContext or {})
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "VALIDATION_FAILED", "message": "invalid userContext"},
        )
    try:
        # Chat never loads DB chunks, embeddings or a retriever. Legacy reads still
        # use the scoped runtime; /rag/query remains an isolated compatibility path.
        runtime = ToolRuntime(db=db_client.db, policy=policy_engine)
        turn: AgentTurn = AgentLoop(runtime, chain, strict_provider=True).run(req.message, user_ctx)
    except LLMUnavailable as exc:
        return _llm_unavailable_response(exc)
    payload = turn.as_dict()
    if req.conversationId:
        payload["conversationId"] = req.conversationId
    return payload


if __name__ == "__main__":  # pragma: no cover - manual run
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
