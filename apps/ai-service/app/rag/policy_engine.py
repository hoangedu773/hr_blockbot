"""Policy RAG facade used by the API layer and tests (FR-017/FR-018, BR-15).

Owns one read-only corpus (DB `policies` when populated, else the seed corpus) and a
retriever selected by config. It never writes to MongoDB: embeddings are produced by
`scripts/embed_policies.py`, not by this service (phase-04 rule).
"""

from __future__ import annotations

from typing import Any

from app.config import settings
from app.llm.chain import ProviderChain
from app.llm.fake import hashing_embed
from app.rag.answer import AnswerResult, answer_policy
from app.rag.corpus import PolicyChunk, load_db_chunks, seed_chunks
from app.rag.retrieval import Retriever, RetrievalResult, build_retriever


def _seed_embedder(texts: list[str]) -> list[list[float]]:
    """Deterministic hashing embedder so offline retrieval works without a provider key."""
    return [hashing_embed(text, settings.embedding_dim) for text in texts]


class PolicyEngine:
    def __init__(
        self,
        chunks: list[PolicyChunk] | None = None,
        retriever_kind: str = "hybrid",
        embedder=None,
    ) -> None:
        self._db_chunks: list[PolicyChunk] = list(chunks) if chunks is not None else []
        self._retriever_kind = retriever_kind
        self._embedder = embedder or _seed_embedder
        self.chunks: list[PolicyChunk] = self._db_chunks or seed_chunks()
        self._retriever: Retriever | None = None
        self._collection: Any = None
        self._index_name: str = ""

    # --- corpus / retriever lifecycle ---------------------------------------------

    def configure_retrieval(
        self,
        *,
        kind: str | None = None,
        embedder=None,
        collection: Any = None,
        index_name: str | None = None,
    ) -> None:
        """Switch retriever implementation from config (rollback path: `lexical`)."""
        if kind:
            self._retriever_kind = kind
        if embedder is not None:
            self._embedder = embedder
        self._collection = collection
        self._index_name = index_name or ""
        self._retriever = None

    @property
    def retriever_kind(self) -> str:
        return self._retriever_kind

    @property
    def retriever(self) -> Retriever:
        if self._retriever is None:
            self._retriever = build_retriever(
                self._retriever_kind,
                chunks=self.chunks,
                embedder=self._embedder,
                collection=self._collection,
                index_name=self._index_name or None,
            )
        return self._retriever

    def sync_policies_from_db(self, db: Any) -> bool:
        """Loads policy chunks READ-ONLY from `policies`; keeps the seed corpus if empty."""
        if db is None:
            return False
        try:
            collection = db.policies
        except AttributeError:
            return False
        chunks = load_db_chunks(collection)
        if not chunks:
            return False
        self._db_chunks = chunks
        self.chunks = chunks
        self._retriever = None
        return True

    # --- capability / retrieval / answer ------------------------------------------

    def check_vector_search_capability(self, db: Any = None) -> dict[str, Any]:
        """Honest capability report: configured + verified, never a fake 'active'."""
        index_name = self._index_name or settings.vector_index_name
        if not index_name:
            return {
                "status": "BLOCKED",
                "vector_search_available": False,
                "reason": (
                    "Atlas Vector Search Index is not configured (set AI_VECTOR_INDEX_NAME). "
                    "Dense retrieval falls back to in-memory cosine / lexical hybrid."
                ),
                "engine_mode": "lexical_hybrid_in_memory",
            }
        if db is None:
            return {
                "status": "CONFIGURED",
                "vector_search_available": True,
                "reason": "index name configured; DB not connected so index readiness is unverified",
                "engine_mode": "atlas_vector_search",
            }
        try:
            indexes = list(db.policies.list_search_indexes(index_name))
        except Exception:  # noqa: BLE001 - capability probe must never crash the app
            indexes = []
        ready = any(str(item.get("status") or "").upper() in ("READY", "ACTIVE") for item in indexes)
        return {
            "status": "AVAILABLE" if ready else "BLOCKED",
            "vector_search_available": ready,
            "reason": (
                f"Atlas Vector Search index '{index_name}' ready"
                if ready
                else f"Atlas Vector Search index '{index_name}' not ready or not found"
            ),
            "engine_mode": "atlas_vector_search",
        }

    def retrieve(
        self,
        question: str,
        k: int | None = None,
        scope: dict[str, Any] | None = None,
    ) -> RetrievalResult:
        return self.retriever.search(question, k=k, scope=scope)

    def answer(
        self,
        question: str,
        chain: ProviderChain | None = None,
        *,
        k: int | None = None,
        scope: dict[str, Any] | None = None,
    ) -> AnswerResult:
        retrieval = self.retrieve(question, k=k, scope=scope)
        return answer_policy(question, retrieval, chain)

    def query(self, question: str, k: int | None = None) -> dict[str, Any]:
        """Backward-compatible dict query used by probes; runs degraded (no provider)."""
        return self.answer(question, chain=None, k=k).as_dict()


policy_engine = PolicyEngine()
