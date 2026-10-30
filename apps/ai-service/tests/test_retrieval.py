"""Retrieval + fusion + abstention + citation verifier tests (TDD for phase-04 §3/§4)."""

from __future__ import annotations

import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import pytest

from app.llm.fake import FakeProvider, hashing_embed
from app.llm.base import ChatMessage, CompletionResult
from app.llm.chain import ProviderChain
from app.config import settings
from app.rag.answer import (
    answer_policy,
    build_messages,
    extractive_answer,
    verify_citations,
)
from app.rag.corpus import PolicyChunk, chunks_from_documents, seed_chunks
from app.rag.retrieval import (
    DenseRetriever,
    Hit,
    HybridRetriever,
    LexicalRetriever,
    build_retriever,
    _cosine,
)


def _hit(chunk_id: str, title: str, text: str = "text", evidence: float = 0.9) -> Hit:
    return Hit(
        chunk_id=chunk_id,
        citation={"document": title, "version": "v1", "article": "Điều 1", "source": "seed"},
        text=text,
        score=evidence,
        evidence=evidence,
    )


class _FixedRetriever:
    def __init__(self, name: str, hits: list[Hit], abstained: bool = False) -> None:
        self.name = name
        self._hits = hits
        self._abstained = abstained

    def search(self, query, k=None, scope=None):
        from app.rag.retrieval import RetrievalResult

        return RetrievalResult(
            hits=list(self._hits),
            abstained=self._abstained,
            retriever=self.name,
            max_evidence=max((hit.evidence for hit in self._hits), default=0.0),
        )


# --- corpus ---------------------------------------------------------------------


def test_chunks_from_documents_supports_both_schema_shapes():
    docs = [
        {
            "title": "Chính sách A",
            "version": "v1",
            "source": "policies",
            "chunks": [{"text": "nội dung 1", "order": 2, "embedding": [0.1, 0.2], "model": "m"}],
        },
        {
            "document": "Chính sách B",
            "version": "v2",
            "articles": [{"article": "Điều 3", "text": "nội dung 2"}],
        },
    ]
    chunks = chunks_from_documents(docs)

    assert [chunk.chunk_id for chunk in chunks] == ["Chính sách A|v1|2", "Chính sách B|v2|0"]
    assert chunks[0].embedding == (0.1, 0.2)
    assert chunks[0].citation["document"] == "Chính sách A"
    assert chunks[1].citation["article"] == "Điều 3"


# --- lexical / dense -------------------------------------------------------------


def test_lexical_bm25_ranks_the_matching_article_first():
    retriever = LexicalRetriever(seed_chunks(), min_evidence=0.2)
    result = retriever.search("chu kỳ tính lương chốt bảng công ngày 05", k=3)

    assert result.abstained is False
    assert "Điều 1" in result.hits[0].citation["article"]
    assert result.hits[0].evidence >= result.hits[1].evidence


def test_lexical_abstains_out_of_scope():
    retriever = LexicalRetriever(seed_chunks())
    result = retriever.search("thời gian bay của tàu con thoi lên trạm không gian ISS")

    assert result.abstained is True
    assert result.citations == []


def test_dense_in_memory_with_fake_embedder_retrieves_related_chunk():
    provider = FakeProvider()

    def embedder(texts: list[str]) -> list[list[float]]:
        return provider.embed(texts).vectors

    retriever = DenseRetriever(seed_chunks(), embedder=embedder)
    result = retriever.search("nhân viên quên bấm vân tay phải nộp giải trình trong bao lâu", k=3)

    assert result.abstained is False
    assert "Điều 2" in result.hits[0].citation["article"]


def test_dense_deterministic_across_runs():
    provider = FakeProvider()
    retriever = DenseRetriever(seed_chunks(), embedder=lambda texts: provider.embed(texts).vectors)
    first = retriever.search("quy trình phê duyệt giải trình công", k=5)
    second = retriever.search("quy trình phê duyệt giải trình công", k=5)

    assert [hit.chunk_id for hit in first.hits] == [hit.chunk_id for hit in second.hits]


def test_dense_atlas_pipeline_shape_and_local_rescoring():
    captured = {}

    class FakeCollection:
        def aggregate(self, pipeline):
            captured["pipeline"] = pipeline
            return [
                {
                    "title": "Chính sách A",
                    "version": "v1",
                    "source": "policies",
                    "vectorSearchScore": 0.6,
                    "chunks": [
                        {"text": "không liên quan", "order": 0, "embedding": hashing_embed("không liên quan", 384)},
                        {"text": "chu kỳ tính lương", "order": 1, "embedding": hashing_embed("chu kỳ tính lương", 384)},
                    ],
                }
            ]

    provider = FakeProvider()

    def embedder(texts: list[str]) -> list[list[float]]:
        return provider.embed(texts).vectors

    retriever = DenseRetriever(
        embedder=embedder,
        collection=FakeCollection(),
        index_name="policy_vector_index",
        num_candidates=50,
    )
    result = retriever.search("chu kỳ tính lương", k=3)

    stage = captured["pipeline"][0]["$vectorSearch"]
    assert stage["index"] == "policy_vector_index"
    assert stage["path"] == "chunks.embedding"
    assert stage["numCandidates"] == 50
    assert len(stage["queryVector"]) == 384
    assert result.hits[0].citation["article"] == "Mục 2"
    assert result.hits[0].text == "chu kỳ tính lương"


# --- hybrid / RRF ----------------------------------------------------------------


def test_hybrid_rrf_ranks_items_found_by_both_sources_first():
    lexical = _FixedRetriever(
        "lexical",
        [_hit("a", "A", evidence=0.9), _hit("b", "B", evidence=0.8)],
    )
    dense = _FixedRetriever(
        "dense",
        [_hit("b", "B", evidence=0.85), _hit("c", "C", evidence=0.8)],
    )
    hybrid = HybridRetriever(lexical, dense, rrf_k=60)
    result = hybrid.search("bất kỳ", k=3)

    assert [hit.chunk_id for hit in result.hits][0] == "b"
    expected_b = 1 / (60 + 2) + 1 / (60 + 1)
    assert result.hits[0].score == pytest.approx(expected_b)
    assert result.hits[0].evidence == pytest.approx(0.85)


def test_hybrid_respects_weights():
    lexical = _FixedRetriever("lexical", [_hit("a", "A", evidence=0.9)])
    dense = _FixedRetriever("dense", [_hit("b", "B", evidence=0.9)])
    hybrid = HybridRetriever(lexical, dense, weight_lexical=2.0, weight_dense=1.0)
    result = hybrid.search("x", k=2)

    assert result.hits[0].chunk_id == "a"
    assert result.hits[0].score == pytest.approx(2.0 / 61)
    assert result.hits[1].score == pytest.approx(1.0 / 61)


def test_hybrid_abstains_only_when_both_sources_abstain():
    # lexical abstains, dense has evidence -> answer
    lexical = _FixedRetriever("lexical", [], abstained=True)
    dense = _FixedRetriever("dense", [_hit("b", "B", evidence=0.5)])
    assert HybridRetriever(lexical, dense).search("x").abstained is False

    # both abstain -> abstain
    dense_weak = _FixedRetriever("dense", [], abstained=True)
    assert HybridRetriever(lexical, dense_weak).search("x").abstained is True


def test_build_retriever_returns_configured_implementation():
    chunks = seed_chunks()
    lexical = build_retriever("lexical", chunks=chunks)
    dense = build_retriever("dense", chunks=chunks, embedder=lambda texts: [hashing_embed(t, 384) for t in texts])
    hybrid = build_retriever("hybrid", chunks=chunks, embedder=lambda texts: [hashing_embed(t, 384) for t in texts])

    assert lexical.name == "lexical"
    assert dense.name == "dense"
    assert hybrid.name == "hybrid"
    with pytest.raises(ValueError):
        build_retriever("bm25-only", chunks=chunks)


# --- citation verifier -----------------------------------------------------------


def test_citation_verifier_accepts_markers_that_map_to_hits():
    hits = [_hit("a", "A"), _hit("b", "B")]
    verification = verify_citations("Theo Điều 1 [1] và Điều 2 [2].", hits)

    assert verification.ok is True
    assert verification.valid_markers == [1, 2]
    assert verification.invalid_markers == []
    assert [citation["document"] for citation in verification.citations(hits)] == ["A", "B"]


def test_citation_verifier_rejects_hallucinated_marker():
    hits = [_hit("a", "A")]
    verification = verify_citations("Theo tài liệu [3].", hits)

    assert verification.ok is False
    assert verification.invalid_markers == [3]


def test_citation_verifier_requires_at_least_one_marker():
    hits = [_hit("a", "A")]
    verification = verify_citations("Không có trích dẫn nào.", hits)

    assert verification.ok is False
    assert verification.valid_markers == []


def test_answer_pipeline_abstains_without_evidence():
    from app.rag.retrieval import RetrievalResult

    retrieval = RetrievalResult(hits=[], abstained=True, retriever="hybrid")
    result = answer_policy("câu hỏi ngoài phạm vi", retrieval, chain=None)

    assert result.abstained is True
    assert result.citations == []
    assert "[1]" not in result.answer


def test_answer_pipeline_uses_llm_and_verifies_citations():
    hits = [_hit("a", "Chính sách A"), _hit("b", "Chính sách B")]
    retrieval = type("R", (), {"hits": hits, "abstained": False, "retriever": "hybrid", "citations": []})()
    scripted = [CompletionResult(text="Kết luận [1].", model="m", provider_id="fake")]
    chain = ProviderChain([FakeProvider(scripted=scripted)])
    result = answer_policy("câu hỏi", retrieval, chain)

    assert result.answer_source == "llm"
    assert result.llm_citation_verified is True
    assert result.citations[0]["document"] == "Chính sách A"
    assert result.abstained is False


def test_answer_pipeline_falls_back_when_llm_citation_is_hallucinated():
    hits = [_hit("a", "Chính sách A")]
    retrieval = type("R", (), {"hits": hits, "abstained": False, "retriever": "hybrid", "citations": []})()
    scripted = [CompletionResult(text="Bịa nguồn [9].", model="m", provider_id="fake")]
    chain = ProviderChain([FakeProvider(scripted=scripted)])
    result = answer_policy("câu hỏi", retrieval, chain)

    assert result.answer_source == "extractive_fallback"
    assert result.llm_citation_verified is False
    assert result.unverified_markers == [9]
    assert result.citations[0]["document"] == "Chính sách A"


def test_answer_pipeline_degrades_when_no_provider():
    hits = [_hit("a", "Chính sách A")]
    from app.rag.retrieval import RetrievalResult

    retrieval = RetrievalResult(hits=hits, abstained=False, retriever="lexical", max_evidence=0.9)
    result = answer_policy("câu hỏi", retrieval, chain=None)

    assert result.degraded is True
    assert result.answer_source == "degraded_structured"
    assert result.citations


def test_answer_pipeline_degrades_when_all_providers_fail():
    hits = [_hit("a", "Chính sách A")]
    from app.rag.retrieval import RetrievalResult

    retrieval = RetrievalResult(hits=hits, abstained=False, retriever="lexical", max_evidence=0.9)

    class _Broken:
        name = "broken"

        # J-1 deadline grouping (chain._run_with_deadline) reads .config and
        # .timeout off every provider before calling it — the fake must honour
        # the provider protocol, not just complete()/embed().
        from app.llm.base import ProviderConfig as _ProviderConfig

        config = _ProviderConfig(
            id="broken", type="fake", model="fake-hashing-embedder", timeout_ms=1000
        )
        timeout = 1.0

        def complete(self, messages, opts=None):
            from app.llm.base import ProviderRateLimited

            raise ProviderRateLimited("quota")

        def embed(self, texts, opts=None):
            raise AssertionError("unused")

    from app.llm.chain import ProviderChain

    result = answer_policy("câu hỏi", retrieval, ProviderChain([_Broken()]))

    assert result.degraded is True
    assert result.answer_source == "degraded_structured"


def test_prompt_contains_only_question_and_evidence():
    hits = [_hit("a", "Chính sách A", text="nội dung quy định")]
    messages = build_messages("câu hỏi của tôi", hits)
    assert any("nội dung quy định" in message.content for message in messages)
    assert any("câu hỏi của tôi" in message.content for message in messages)
    # no PII fields are ever interpolated into the prompt
    for forbidden in ("phone", "salary", "bank_", "cccd"):
        assert all(forbidden not in message.content for message in messages)
