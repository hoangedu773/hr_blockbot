"""Retrieval layer (docs/21-chatbot-architecture.md §6).

interface Retriever { search(q, scope, k) -> RetrievalResult ; name }

Implementations:
- `LexicalRetriever`: pure-Python BM25 (no heavy dependency, no Atlas text index).
- `DenseRetriever`: `$vectorSearch` on `policies.chunks.embedding`; falls back to
  in-memory cosine when no collection/index is supplied (tests, offline eval).
- `HybridRetriever`: Reciprocal Rank Fusion (k=60) of the two lists; configurable
  weights; abstains only when *both* component retrievers abstain.

Abstention thresholds are per-retriever because the score scales differ: cosine
similarity for dense vs saturating BM25 for lexical. Defaults live in `app/config.py`
and are labelled assumptions until calibrated (docs/08-algorithms.md §7.3).
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Protocol

from app.config import settings
from app.rag.corpus import PolicyChunk
from app.text_utils import tokenize

Embedder = Callable[[list[str]], list[list[float]]]

logger = logging.getLogger("ai.rag.retrieval")


@dataclass(frozen=True)
class Hit:
    chunk_id: str
    citation: dict[str, Any]
    text: str
    score: float
    evidence: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "chunkId": self.chunk_id,
            "document": self.citation.get("document"),
            "version": self.citation.get("version"),
            "article": self.citation.get("article"),
            "source": self.citation.get("source"),
            "text": self.text,
            "score": round(self.score, 6),
            "evidence": round(self.evidence, 6),
        }


@dataclass
class RetrievalResult:
    hits: list[Hit]
    abstained: bool
    retriever: str
    max_evidence: float = 0.0
    reason: str | None = None

    @property
    def citations(self) -> list[dict[str, Any]]:
        if self.abstained:
            return []
        return [dict(hit.citation, score=round(hit.score, 6)) for hit in self.hits]

    def as_dict(self) -> dict[str, Any]:
        return {
            "retriever": self.retriever,
            "abstained": self.abstained,
            "reason": self.reason,
            "maxEvidence": round(self.max_evidence, 6),
            "hits": [hit.as_dict() for hit in self.hits],
        }


class Retriever(Protocol):
    name: str

    def search(self, query: str, k: int | None = None, scope: dict[str, Any] | None = None) -> RetrievalResult:
        ...


def _in_scope(chunk: PolicyChunk, scope: dict[str, Any] | None) -> bool:
    """Chunk-level scope check.

    A chunk without `department_ids` is visible to everyone; otherwise the caller's
    `departmentId` (or `departmentIds`) must intersect. Field naming is an assumption
    until Phase 1 fixes the `policies` schema (docs/05 §3.8 has no scope field).
    """
    if not scope or not chunk.department_ids:
        return True
    wanted = set()
    if scope.get("departmentId"):
        wanted.add(str(scope["departmentId"]))
    wanted.update(str(item) for item in (scope.get("departmentIds") or ()))
    return bool(wanted.intersection(chunk.department_ids))


def _cosine(a: Iterable[float], b: Iterable[float]) -> float:
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


class BM25Index:
    """Pure-Python Okapi BM25 over pre-tokenised chunks."""

    def __init__(self, tokenised_docs: list[list[str]], k1: float = 1.5, b: float = 0.75) -> None:
        self._docs = tokenised_docs
        self._k1 = k1
        self._b = b
        self._n = len(tokenised_docs)
        self._avgdl = (sum(len(doc) for doc in tokenised_docs) / self._n) if self._n else 0.0
        self._tf: list[dict[str, int]] = []
        df: dict[str, int] = {}
        for doc in tokenised_docs:
            counts: dict[str, int] = {}
            for token in doc:
                counts[token] = counts.get(token, 0) + 1
            self._tf.append(counts)
            for token in counts:
                df[token] = df.get(token, 0) + 1
        self._idf = {
            token: math.log(1.0 + (self._n - freq + 0.5) / (freq + 0.5))
            for token, freq in df.items()
        }

    def scores(self, query_tokens: list[str]) -> list[float]:
        scores = [0.0] * self._n
        if not query_tokens or self._n == 0:
            return scores
        for index, counts in enumerate(self._tf):
            doc_len = len(self._docs[index]) or 1
            score = 0.0
            for token in query_tokens:
                frequency = counts.get(token, 0)
                if frequency == 0:
                    continue
                idf = self._idf.get(token, 0.0)
                denominator = frequency + self._k1 * (1.0 - self._b + self._b * doc_len / self._avgdl)
                score += idf * frequency * (self._k1 + 1.0) / denominator
            scores[index] = score
        return scores

    def idf_mass(self, query_tokens: list[str]) -> float:
        """Sum of IDF weights of the query terms (0 for terms absent from the corpus).

        Used to normalise BM25 into a "fraction of the query's information matched"
        score in [0, 1], so the abstention threshold has an interpretable meaning
        instead of depending on an unbounded raw score.
        """
        unknown_idf = math.log(1.0 + (self._n + 0.5) / 0.5) if self._n else 0.0
        return sum(self._idf.get(token, unknown_idf) for token in set(query_tokens))


def _saturate(score: float, ideal: float) -> float:
    """Normalise raw BM25 by the IDF mass of the query -> interpretable [0, 1] evidence."""
    if score <= 0 or ideal <= 0:
        return 0.0
    return min(1.0, score / ideal)


class LexicalRetriever:
    name = "lexical"

    def __init__(
        self,
        chunks: list[PolicyChunk],
        *,
        k1: float | None = None,
        b: float | None = None,
        min_evidence: float | None = None,
    ) -> None:
        self.chunks = list(chunks)
        self.min_evidence = settings.min_evidence_lexical if min_evidence is None else min_evidence
        self._index = BM25Index(
            [tokenize(chunk.searchable_text(), drop_stopwords=True) for chunk in self.chunks],
            k1=settings.bm25_k1 if k1 is None else k1,
            b=settings.bm25_b if b is None else b,
        )

    def search(self, query: str, k: int | None = None, scope: dict[str, Any] | None = None) -> RetrievalResult:
        top_k = k or settings.top_k
        query_tokens = tokenize(query, drop_stopwords=True)
        raw_scores = self._index.scores(query_tokens)
        ideal = self._index.idf_mass(query_tokens)
        ranked: list[Hit] = []
        for chunk, raw in zip(self.chunks, raw_scores):
            if raw <= 0 or not _in_scope(chunk, scope):
                continue
            ranked.append(
                Hit(
                    chunk_id=chunk.chunk_id,
                    citation=chunk.citation,
                    text=chunk.text,
                    score=raw,
                    evidence=_saturate(raw, ideal),
                )
            )
        ranked.sort(key=lambda hit: (-hit.evidence, hit.chunk_id))
        hits = ranked[:top_k]
        max_evidence = hits[0].evidence if hits else 0.0
        abstained = max_evidence < self.min_evidence
        return RetrievalResult(
            hits=hits,
            abstained=abstained,
            retriever=self.name,
            max_evidence=max_evidence,
            reason="no_evidence" if abstained else None,
        )


class DenseRetriever:
    name = "dense"

    def __init__(
        self,
        chunks: list[PolicyChunk] | None = None,
        *,
        embedder: Embedder | None = None,
        min_evidence: float | None = None,
        collection: Any = None,
        index_name: str | None = None,
        num_candidates: int | None = None,
    ) -> None:
        self.embedder = embedder
        self.collection = collection
        self.index_name = index_name if index_name is not None else settings.vector_index_name
        self.num_candidates = num_candidates or settings.vector_num_candidates
        self.min_evidence = settings.min_evidence_dense if min_evidence is None else min_evidence
        self.chunks = list(chunks or [])
        self._embeddings: list[list[float]] = []
        if self.chunks and not self.collection:
            self._prepare_embeddings()

    def _prepare_embeddings(self) -> None:
        missing = [chunk for chunk in self.chunks if chunk.embedding is None]
        embedded: dict[str, list[float]] = {}
        if missing:
            if self.embedder is None:
                raise ValueError("DenseRetriever needs an embedder for chunks without embeddings")
            vectors = self.embedder([chunk.searchable_text() for chunk in missing])
            embedded = {chunk.chunk_id: vector for chunk, vector in zip(missing, vectors)}
        self._embeddings = [
            list(chunk.embedding) if chunk.embedding is not None else embedded[chunk.chunk_id]
            for chunk in self.chunks
        ]

    def _embed_query(self, query: str) -> list[float]:
        if self.embedder is None:
            raise ValueError("DenseRetriever needs an embedder to embed the query")
        return self.embedder([query])[0]

    def search(self, query: str, k: int | None = None, scope: dict[str, Any] | None = None) -> RetrievalResult:
        top_k = k or settings.top_k
        query_vector = self._embed_query(query)
        if self.collection is not None and self.index_name:
            hits = self._search_atlas(query_vector, top_k, scope)
        else:
            hits = self._search_in_memory(query_vector, top_k, scope)
        hits.sort(key=lambda hit: (-hit.evidence, hit.chunk_id))
        hits = hits[:top_k]
        max_evidence = hits[0].evidence if hits else 0.0
        abstained = max_evidence < self.min_evidence
        return RetrievalResult(
            hits=hits,
            abstained=abstained,
            retriever=self.name,
            max_evidence=max_evidence,
            reason="no_evidence" if abstained else None,
        )

    def _search_in_memory(
        self, query_vector: list[float], top_k: int, scope: dict[str, Any] | None
    ) -> list[Hit]:
        hits: list[Hit] = []
        for chunk, embedding in zip(self.chunks, self._embeddings):
            if not _in_scope(chunk, scope):
                continue
            similarity = _cosine(query_vector, embedding)
            if similarity <= 0:
                continue
            hits.append(
                Hit(
                    chunk_id=chunk.chunk_id,
                    citation=chunk.citation,
                    text=chunk.text,
                    score=similarity,
                    evidence=similarity,
                )
            )
        return hits

    def _search_atlas(
        self, query_vector: list[float], top_k: int, scope: dict[str, Any] | None
    ) -> list[Hit]:
        """`$vectorSearch` over policy documents, then local chunk re-scoring.

        Atlas scores a document by its best-matching chunk embedding but does not say
        which chunk matched; the stored chunks are therefore re-scored locally with the
        same query vector so the citation points at the right article.
        """
        stage: dict[str, Any] = {
            "index": self.index_name,
            "path": "chunks.embedding",
            "queryVector": query_vector,
            "numCandidates": max(self.num_candidates, top_k),
            "limit": max(top_k, 1),
        }
        if scope:
            wanted = []
            if scope.get("departmentId"):
                wanted.append(str(scope["departmentId"]))
            wanted.extend(str(item) for item in (scope.get("departmentIds") or ()))
            if wanted:
                stage["filter"] = {"departmentIds": {"$in": wanted}}
        pipeline = [
            {"$vectorSearch": stage},
            {
                "$project": {
                    "_id": 0,
                    "document": 1,
                    "title": 1,
                    "version": 1,
                    "source": 1,
                    "chunks": 1,
                    "vectorSearchScore": {"$meta": "vectorSearchScore"},
                }
            },
        ]
        hits: list[Hit] = []
        for document in self.collection.aggregate(pipeline):
            document_name = str(document.get("document") or document.get("title") or "Tài liệu chính sách")
            version = str(document.get("version") or "v1.0")
            source = str(document.get("source") or "policies")
            departments = tuple(str(item) for item in (document.get("departmentIds") or ()))
            chunk_scores: list[tuple[float, dict[str, Any]]] = []
            for chunk in document.get("chunks") or []:
                embedding = chunk.get("embedding")
                if not embedding:
                    continue
                chunk_scores.append((_cosine(query_vector, embedding), chunk))
            if not chunk_scores:
                # No embeddings stored on chunks: fall back to the document-level score
                # and report the document itself (never invent an article name).
                fallback = float(document.get("vectorSearchScore") or 0.0)
                hits.append(
                    Hit(
                        chunk_id=f"{document_name}|{version}|doc",
                        citation={
                            "document": document_name,
                            "version": version,
                            "article": "Toàn văn",
                            "source": source,
                        },
                        text="",
                        score=fallback,
                        evidence=fallback,
                    )
                )
                continue
            similarity, best_chunk = max(chunk_scores, key=lambda item: item[0])
            order = int(best_chunk.get("order", 0))
            hits.append(
                Hit(
                    chunk_id=f"{document_name}|{version}|{order}",
                    citation={
                        "document": document_name,
                        "version": version,
                        "article": str(best_chunk.get("article") or best_chunk.get("title") or f"Mục {order + 1}"),
                        "source": source,
                    },
                    text=str(best_chunk.get("text") or ""),
                    score=similarity,
                    evidence=similarity,
                )
            )
        return hits


class HybridRetriever:
    name = "hybrid"

    def __init__(
        self,
        lexical: LexicalRetriever,
        dense: DenseRetriever,
        *,
        rrf_k: int | None = None,
        weight_lexical: float | None = None,
        weight_dense: float | None = None,
    ) -> None:
        self.lexical = lexical
        self.dense = dense
        self.rrf_k = settings.rrf_k if rrf_k is None else rrf_k
        self.weight_lexical = settings.rrf_weight_lexical if weight_lexical is None else weight_lexical
        self.weight_dense = settings.rrf_weight_dense if weight_dense is None else weight_dense

    def search(self, query: str, k: int | None = None, scope: dict[str, Any] | None = None) -> RetrievalResult:
        top_k = k or settings.top_k
        lexical_result = self.lexical.search(query, top_k, scope)
        dense_result = self.dense.search(query, top_k, scope)

        fused: dict[str, dict[str, Any]] = {}
        for weight, result in ((self.weight_lexical, lexical_result), (self.weight_dense, dense_result)):
            for rank, hit in enumerate(result.hits, start=1):
                entry = fused.setdefault(
                    hit.chunk_id,
                    {
                        "hit": hit,
                        "score": 0.0,
                        "evidence": 0.0,
                        "lexical_evidence": 0.0,
                        "dense_evidence": 0.0,
                    },
                )
                entry["score"] += weight / (self.rrf_k + rank)
                entry["evidence"] = max(entry["evidence"], hit.evidence)
                if result.retriever == "lexical":
                    entry["lexical_evidence"] = hit.evidence
                else:
                    entry["dense_evidence"] = hit.evidence

        hits = [
            Hit(
                chunk_id=entry["hit"].chunk_id,
                citation=entry["hit"].citation,
                text=entry["hit"].text,
                score=entry["score"],
                evidence=entry["evidence"],
            )
            for entry in fused.values()
        ]
        hits.sort(key=lambda hit: (-hit.score, hit.chunk_id))
        hits = hits[:top_k]
        # Hybrid abstains only when both sources are below their own thresholds: each
        # retriever has a different score scale, so a shared numeric threshold would be
        # meaningless (documented assumption).
        abstained = lexical_result.abstained and dense_result.abstained
        max_evidence = max(lexical_result.max_evidence, dense_result.max_evidence)
        return RetrievalResult(
            hits=hits,
            abstained=abstained,
            retriever=self.name,
            max_evidence=max_evidence,
            reason="no_evidence" if abstained else None,
        )


def build_retriever(
    kind: str,
    *,
    chunks: list[PolicyChunk],
    embedder: Embedder | None = None,
    collection: Any = None,
    index_name: str | None = None,
) -> Retriever:
    """Factory used by the API layer and the eval harness.

    Real Atlas data can carry policy chunks with no stored embeddings (the seeded
    corpus does not). `hybrid` then used to raise at construction time, which broke
    the default chat path on production data. Falling back to lexical keeps answers
    possible and is logged, so the degradation is visible instead of fatal.
    """
    if kind == "lexical":
        return LexicalRetriever(chunks)
    has_vectors = any(chunk.embedding for chunk in chunks)
    if kind in ("dense", "hybrid") and not has_vectors and embedder is None and collection is None:
        logger.warning(
            "retriever=%s but no chunk has an embedding and no embedder is configured; using lexical",
            kind,
        )
        return LexicalRetriever(chunks)
    dense = DenseRetriever(
        chunks,
        embedder=embedder,
        collection=collection,
        index_name=index_name,
    )
    if kind == "dense":
        return dense
    if kind == "hybrid":
        return HybridRetriever(LexicalRetriever(chunks), dense)
    if kind == "cached":
        return CachedRetriever(LexicalRetriever(chunks))
    raise ValueError(f"unknown retriever: {kind}")


class CachedRetriever:
    name = "cached"

    def __init__(self, inner: Retriever, ttl_seconds: float = 300.0, max_size: int = 128) -> None:
        import time
        self.inner = inner
        self.ttl = ttl_seconds
        self.max_size = max_size
        self._time = time.time
        self._cache: dict[str, tuple[float, RetrievalResult]] = {}

    def search(self, query: str, k: int | None = None, scope: dict[str, Any] | None = None) -> RetrievalResult:
        norm_q = " ".join(query.strip().lower().split())
        scope_key = str(sorted(scope.items())) if scope else ""
        cache_key = f"{norm_q}:{k}:{scope_key}"
        now = self._time()
        if cache_key in self._cache:
            timestamp, result = self._cache[cache_key]
            if now - timestamp < self.ttl:
                return result
            self._cache.pop(cache_key, None)

        result = self.inner.search(query, k=k, scope=scope)
        if len(self._cache) >= self.max_size:
            oldest_key = min(self._cache, key=lambda key: self._cache[key][0])
            self._cache.pop(oldest_key, None)
        self._cache[cache_key] = (now, result)
        return result
