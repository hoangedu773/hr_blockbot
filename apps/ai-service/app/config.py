"""Runtime settings for the AI service.

Every threshold below is an *assumed default*: `docs/08-algorithms.md` §7.2/§7.3 and
`docs/21-chatbot-architecture.md` §6/§13 keep TOP_K, MIN_EVIDENCE, RRF weights, chunk
size and timeouts as `TBD`. They are env-overridable and must be calibrated with
`eval/run_eval.py` before any number is quoted in a report.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# J-4: load .env here, not only in start.py. `render.yaml` starts the service with
# `uvicorn app.main:app`, which never imports start.py, so keys/env vars were
# silently missing on that path and the gate fell back to the rule path.
# Hermetic suite (ai-test-harness-hermetic phase 01): tests/conftest.py strips all
# AI_*/JEV_* env vars and sets PYTHON_DOTENV_DISABLED=1; honour that flag, or the
# .env file re-arms live Jev keys AFTER the strip and the gateway dials out.
try:
    from pathlib import Path as _Path

    from dotenv import load_dotenv as _load_dotenv

    import os as _os

    if not _os.environ.get("PYTHON_DOTENV_DISABLED"):
        _load_dotenv(_Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # python-dotenv is optional at runtime
    pass


def _env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    # Retrieval (assumed defaults — calibrate with eval/ before publication).
    top_k: int = 5
    embedding_dim: int = 384
    # Model used ONLY for embeddings (`_embedding_chain`); text generation uses llm_model.
    embedding_model: str = "gemini-embedding-001"
    bm25_k1: float = 1.5
    bm25_b: float = 0.75
    min_evidence_dense: float = 0.30
    # Calibrated 2026-10-29 on `--corpus db` (40 câu, 30 in-scope / 10 out-of-scope):
    # 0.50–0.70 là vùng phẳng tốt nhất (false_answer 0.20, abstain_in 0.03); chọn giữa
    # vùng để còn biên dung sai hai phía. 0.35 cũ để lọt 50% câu ngoài phạm vi.
    min_evidence_lexical: float = 0.60
    rrf_k: int = 60
    rrf_weight_dense: float = 1.0
    rrf_weight_lexical: float = 1.0
    default_retriever: str = "hybrid"
    vector_index_name: str = ""
    vector_num_candidates: int = 100

    # Guards (FR-019; 08 §6.2 — values were `TBD`, these are group assumptions).
    max_steps: int = 5
    tool_timeout_ms: int = 3000
    llm_timeout_ms: int = 20000
    max_tool_result_items: int = 20

    # Provider config cache (ADR-017: `apps/api` passes the decrypted config per
    # request, keyed by `configVersion`; cache must be short-lived).
    provider_cache_ttl_seconds: float = 60.0
    provider_cache_max_versions: int = 8

    # In-context generation and typed decisions. Secrets and endpoints come from
    # env/request only; no provider URL is baked into source.
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "ag/gemini-3.8-flash-low"
    jev_api_key: str = ""
    jev_model: str = "typesafe/jev-1.14"
    decision_timeout_ms: int = 8000

    # UseJevAI trial accounts (queued run API, see app/agent/jev_usejevai.py).
    # Comma-separated keys; rotation skips dead keys and cools down rate-limited ones.
    jev_usejevai_keys: str = ""
    jev_usejevai_base_url: str = "https://usejevai.com"
    # J-1: apps/api aborts the whole ai-service call at 15s. The decision gate runs
    # before generation, so its own budget must leave room for the LLM: 6s here.
    jev_usejevai_timeout_ms: int = 6000
    jev_usejevai_cooldown_seconds: float = 60.0

    # Transport / auth.
    ai_service_api_key: str = ""
    request_max_chars: int = 2000


def load_settings() -> Settings:
    resolved = Settings(
        top_k=_env_int("AI_TOP_K", 5),
        embedding_dim=_env_int("AI_EMBEDDING_DIM", 384),
        embedding_model=_env_str("AI_EMBEDDING_MODEL", "gemini-embedding-001"),
        bm25_k1=_env_float("AI_BM25_K1", 1.5),
        bm25_b=_env_float("AI_BM25_B", 0.75),
        min_evidence_dense=_env_float("AI_MIN_EVIDENCE_DENSE", 0.30),
        min_evidence_lexical=_env_float("AI_MIN_EVIDENCE_LEXICAL", 0.60),
        rrf_k=_env_int("AI_RRF_K", 60),
        rrf_weight_dense=_env_float("AI_RRF_WEIGHT_DENSE", 1.0),
        rrf_weight_lexical=_env_float("AI_RRF_WEIGHT_LEXICAL", 1.0),
        default_retriever=_env_str("AI_RETRIEVER", "hybrid"),
        vector_index_name=_env_str("AI_VECTOR_INDEX_NAME", ""),
        vector_num_candidates=_env_int("AI_VECTOR_NUM_CANDIDATES", 100),
        max_steps=_env_int("AI_MAX_STEPS", 5),
        tool_timeout_ms=_env_int("AI_TOOL_TIMEOUT_MS", 3000),
        llm_timeout_ms=_env_int("AI_LLM_TIMEOUT_MS", 20000),
        max_tool_result_items=_env_int("AI_MAX_TOOL_RESULT_ITEMS", 20),
        provider_cache_ttl_seconds=_env_float("AI_PROVIDER_CACHE_TTL_SECONDS", 60.0),
        provider_cache_max_versions=_env_int("AI_PROVIDER_CACHE_MAX_VERSIONS", 8),
        llm_base_url=_env_str("AI_LLM_BASE_URL", ""),
        llm_api_key=_env_str("AI_LLM_API_KEY", _env_str("OPENAI_API_KEY", "")),
        llm_model=_env_str("AI_LLM_MODEL", "ag/gemini-3.8-flash-low"),
        jev_api_key=_env_str("JEV_API_KEY", ""),
        jev_model=_env_str("JEV_MODEL", "typesafe/jev-1.14"),
        decision_timeout_ms=_env_int("AI_DECISION_TIMEOUT_MS", 8000),
        jev_usejevai_keys=_env_str("JEV_USEJEVAI_KEYS", ""),
        jev_usejevai_base_url=_env_str("JEV_USEJEVAI_BASE_URL", "https://usejevai.com"),
        jev_usejevai_timeout_ms=_env_int("JEV_USEJEVAI_TIMEOUT_MS", 6000),
        jev_usejevai_cooldown_seconds=_env_float("JEV_USEJEVAI_COOLDOWN_SECONDS", 60.0),
        ai_service_api_key=_env_str("AI_SERVICE_API_KEY", ""),
        request_max_chars=_env_int("AI_REQUEST_MAX_CHARS", 2000),
    )
    # J-2: the pool budget must fit inside the decision budget. Without this check
    # AI_DECISION_TIMEOUT_MS silently has no effect on the Jev path.
    if resolved.jev_usejevai_timeout_ms > resolved.decision_timeout_ms:
        raise ValueError(
            "JEV_USEJEVAI_TIMEOUT_MS must not exceed AI_DECISION_TIMEOUT_MS "
            f"({resolved.jev_usejevai_timeout_ms} > {resolved.decision_timeout_ms})"
        )
    return resolved


settings = load_settings()
