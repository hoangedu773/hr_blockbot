"""Grounded answer pipeline + citation verifier (FR-017, BR-15, docs/08 §7.3).

Rules implemented here:
- The prompt carries only the question and numbered evidence chunks; no PII fields.
- The model must cite `[n]` for every claim; `verify_citations` maps markers back to
  retrieved chunks and rejects hallucinated markers.
- If evidence is insufficient the pipeline abstains instead of guessing.
- Without a working provider the pipeline degrades to structured/extractive output
  (`degraded-structured`, docs/08 §6.3) and still returns verifiable citations.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.llm.base import ChatMessage, CompletionOptions, LLMUnavailable
from app.llm.chain import ProviderChain
from app.rag.retrieval import Hit, RetrievalResult

SYSTEM_PROMPT = (
    "Bạn là trợ lý nội bộ của chuỗi Guta Cafe, trả lời câu hỏi về chính sách và quy chế "
    "nhân sự. QUY TẮC BẮT BUỘC:\n"
    "1. Chỉ dùng thông tin trong phần BẰNG CHỨNG được cung cấp; không dùng kiến thức bên ngoài.\n"
    "2. Mỗi khẳng định phải kèm trích dẫn dạng [n] đúng số thứ tự bằng chứng.\n"
    "3. Nếu bằng chứng không đủ trả lời, nói rõ tài liệu đang lưu chưa quy định nội dung đó; "
    "tuyệt đối không suy đoán và không bịa tên tài liệu, điều khoản hay con số.\n"
    "4. Trả lời ngắn gọn bằng tiếng Việt."
)

ABSTAIN_ANSWER = (
    "Thông tin bạn hỏi chưa được quy định trong các tài liệu chính sách đang lưu của Guta Cafe. "
    "Vui lòng liên hệ trực tiếp phòng Nhân sự hoặc Cửa hàng trưởng để được hỗ trợ."
)

DEGRADED_NOTE = "Đang ở chế độ không có model ngôn ngữ lớn: trả kết quả trích nguyên văn từ tài liệu."

CITATION_MARKER = re.compile(r"\[(\d{1,2})\]")

MAX_EVIDENCE_CHARS = 1200


@dataclass
class CitationVerification:
    ok: bool
    valid_markers: list[int] = field(default_factory=list)
    invalid_markers: list[int] = field(default_factory=list)

    def citations(self, hits: list[Hit]) -> list[dict[str, Any]]:
        seen: list[dict[str, Any]] = []
        for marker in self.valid_markers:
            hit = hits[marker - 1]
            citation = dict(hit.citation, score=round(hit.score, 6))
            if citation not in seen:
                seen.append(citation)
        return seen


def render_evidence(hits: list[Hit]) -> str:
    lines: list[str] = []
    for index, hit in enumerate(hits, start=1):
        text = hit.text[:MAX_EVIDENCE_CHARS]
        lines.append(
            f"[{index}] {hit.citation.get('document')} "
            f"({hit.citation.get('version')}) - {hit.citation.get('article')}: {text}"
        )
    return "\n".join(lines)


def build_messages(question: str, hits: list[Hit]) -> list[ChatMessage]:
    return [
        ChatMessage("system", SYSTEM_PROMPT),
        ChatMessage(
            "user",
            f"BẰNG CHỨNG:\n{render_evidence(hits)}\n\nCÂU HỎI: {question}",
        ),
    ]


def verify_citations(answer_text: str, hits: list[Hit]) -> CitationVerification:
    """Every `[n]` must map to a retrieved chunk; at least one valid marker is required.

    Markers pointing outside the evidence list are treated as hallucinated citations
    (not silently dropped) so the caller can reject the answer.
    """
    valid: list[int] = []
    invalid: list[int] = []
    for raw in CITATION_MARKER.findall(answer_text or ""):
        marker = int(raw)
        if 1 <= marker <= len(hits) and hits[marker - 1].text:
            if marker not in valid:
                valid.append(marker)
        else:
            if marker not in invalid:
                invalid.append(marker)
    return CitationVerification(
        ok=bool(valid) and not invalid,
        valid_markers=valid,
        invalid_markers=invalid,
    )


def extractive_answer(hits: list[Hit]) -> str:
    """Deterministic answer used in degraded mode / when the LLM answer fails verification."""
    if not hits:
        return ABSTAIN_ANSWER
    best = hits[0]
    return (
        f"{DEGRADED_NOTE}\n\n"
        f"Theo {best.citation.get('article')} ({best.citation.get('document')} - "
        f"{best.citation.get('version')}): \"{best.text}\" [1]"
    )


def _fallback_citations(hits: list[Hit]) -> list[dict[str, Any]]:
    return [dict(hit.citation, score=round(hit.score, 6)) for hit in hits]


@dataclass
class AnswerResult:
    answer: str
    citations: list[dict[str, Any]]
    abstained: bool
    degraded: bool
    retriever: str
    provider_id: str | None = None
    answer_source: str = "llm"  # llm | extractive_fallback | degraded_structured | abstain
    llm_citation_verified: bool = False
    unverified_markers: list[int] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "answer": self.answer,
            "citations": self.citations,
            "abstain": self.abstained,
            "degraded": self.degraded,
            "retriever": self.retriever,
            "providerId": self.provider_id,
            "answerSource": self.answer_source,
            "llmCitationVerified": self.llm_citation_verified,
            "unverifiedMarkers": self.unverified_markers,
            "usage": self.usage,
        }

    @property
    def ok(self) -> bool:
        return self.abstained or bool(self.citations)


def answer_policy(
    question: str,
    retrieval: RetrievalResult,
    chain: ProviderChain | None,
    *,
    max_tokens: int | None = None,
    strict_provider: bool = False,
) -> AnswerResult:
    """Turn retrieval hits into a cited answer, abstaining when evidence is thin.

    `strict_provider=True` is used by the production chat path: when no provider can
    answer it raises `LLMUnavailable` (HTTP 503 at the boundary) instead of silently
    degrading. The eval/CLI path keeps the degraded-structured fallback.
    """
    if retrieval.abstained or not retrieval.hits:
        return AnswerResult(
            answer=ABSTAIN_ANSWER,
            citations=[],
            abstained=True,
            degraded=chain is None or not chain,
            retriever=retrieval.retriever,
            answer_source="abstain",
        )

    if chain is None or not chain:
        if strict_provider:
            raise LLMUnavailable([{"providerId": "none", "code": "LLM_UNAVAILABLE"}])
        return AnswerResult(
            answer=extractive_answer(retrieval.hits),
            citations=_fallback_citations(retrieval.hits),
            abstained=False,
            degraded=True,
            retriever=retrieval.retriever,
            provider_id=None,
            answer_source="degraded_structured",
        )

    try:
        completion = chain.complete(
            build_messages(question, retrieval.hits),
            CompletionOptions(temperature=0.0, max_tokens=max_tokens),
        )
    except LLMUnavailable:
        if strict_provider:
            raise
        return AnswerResult(
            answer=extractive_answer(retrieval.hits),
            citations=_fallback_citations(retrieval.hits),
            abstained=False,
            degraded=True,
            retriever=retrieval.retriever,
            provider_id=None,
            answer_source="degraded_structured",
        )

    verification = verify_citations(completion.text, retrieval.hits)
    usage = {"inputTokens": completion.tokens_in, "outputTokens": completion.tokens_out}
    if not verification.ok:
        # Do not ship an answer whose citations cannot be mapped: fall back to the
        # extractive answer built from the top chunk (still verifiable), and report the
        # rejected markers rather than hiding the failure.
        return AnswerResult(
            answer=extractive_answer(retrieval.hits),
            citations=_fallback_citations(retrieval.hits),
            abstained=False,
            degraded=False,
            retriever=retrieval.retriever,
            provider_id=completion.provider_id,
            answer_source="extractive_fallback",
            llm_citation_verified=False,
            unverified_markers=verification.invalid_markers,
            usage=usage,
        )

    return AnswerResult(
        answer=completion.text,
        citations=verification.citations(retrieval.hits),
        abstained=False,
        degraded=False,
        retriever=retrieval.retriever,
        provider_id=completion.provider_id,
        answer_source="llm",
        llm_citation_verified=True,
        usage=usage,
    )
