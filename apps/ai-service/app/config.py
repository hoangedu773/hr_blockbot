"""Runtime settings for the AI service.

Every threshold below is an *assumed default*: `docs/08-algorithms.md` §7.2/§7.3 and
`docs/21-chatbot-architecture.md` §6/§13 keep TOP_K, MIN_EVIDENCE, RRF weights, chunk
size and timeouts as `TBD`. They are env-overridable and must be calibrated with
`eval/run_eval.py` before any number is quoted in a report.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


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
    bm25_k1: float = 1.5
    bm25_b: float = 0.75
    min_evidence_dense: float = 0.30
    min_evidence_lexical: float = 0.35
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

    # Transport / auth.
    ai_service_api_key: str = ""
    request_max_chars: int = 2000


def load_settings() -> Settings:
    return Settings(
        top_k=_env_int("AI_TOP_K", 5),
        embedding_dim=_env_int("AI_EMBEDDING_DIM", 384),
        bm25_k1=_env_float("AI_BM25_K1", 1.5),
        bm25_b=_env_float("AI_BM25_B", 0.75),
        min_evidence_dense=_env_float("AI_MIN_EVIDENCE_DENSE", 0.30),
        min_evidence_lexical=_env_float("AI_MIN_EVIDENCE_LEXICAL", 0.35),
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
        ai_service_api_key=_env_str("AI_SERVICE_API_KEY", ""),
        request_max_chars=_env_int("AI_REQUEST_MAX_CHARS", 2000),
    )


settings = load_settings()
