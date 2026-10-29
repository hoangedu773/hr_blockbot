"""Deterministic offline provider used by tests and by the eval harness.

This is a **mock**, not a model:
- `embed()` hashes unigrams + bigrams into a fixed-dimension vector (no semantic
  knowledge beyond shared words). It exists so retrieval/plumbing can be exercised
  without an API key.
- `complete()` either replays scripted responses (tests of the agent loop) or echoes
  the numbered evidence it received with `[n]` markers (offline eval).

Any metric produced with this provider is labelled "mock" in `eval/report.md`; it
does not prove retrieval quality against a real embedding model.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from app.config import settings
from app.llm.base import (
    ChatMessage,
    CompletionOptions,
    CompletionResult,
    EmbeddingResult,
    LLMProvider,
    ProviderConfig,
    ToolCall,
)
from app.text_utils import tokenize_with_bigrams

_MOCK_ANSWER_HEADER = (
    "Theo tài liệu chính sách đang lưu (câu trả lời sinh bởi mock provider, "
    "không phải model thật):"
)


def hashing_embed(text: str, dim: int) -> list[float]:
    """Deterministic bag-of-ngrams embedding, L2-normalised."""
    vector = [0.0] * dim
    for token in tokenize_with_bigrams(text):
        digest = hashlib.sha1(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


class FakeProvider(LLMProvider):
    def __init__(
        self,
        config: ProviderConfig | None = None,
        *,
        scripted: list[CompletionResult | str] | None = None,
        dim: int | None = None,
    ) -> None:
        super().__init__(
            config
            or ProviderConfig(id="fake", type="fake", model="fake-hashing-embedder", timeout_ms=1000)
        )
        self.dim = dim or settings.embedding_dim
        self._scripted = list(scripted or [])
        self.calls: list[list[ChatMessage]] = []
    def complete(
        self,
        messages: list[ChatMessage],
        opts: CompletionOptions | None = None,
    ) -> CompletionResult:
        self.calls.append(list(messages))
        if self._scripted:
            item = self._scripted.pop(0)
            if isinstance(item, str):
                return CompletionResult(
                    text=item, model=self.config.model, provider_id=self.config.id
                )
            return item
        return CompletionResult(
            text=_echo_evidence(messages),
            model=self.config.model,
            provider_id=self.config.id,
            tokens_in=0,
            tokens_out=0,
        )

    def embed(self, texts: list[str], opts: dict | None = None) -> EmbeddingResult:
        return EmbeddingResult(
            vectors=[hashing_embed(text, self.dim) for text in texts],
            model=self.config.model,
            provider_id=self.config.id,
        )


def _echo_evidence(messages: list[ChatMessage]) -> str:
    """Compose a grounded answer citing every numbered evidence line found.

    When invoked by AgentLoop (requesting structured JSON with citations schema),
    returns valid JSON with reply containing citations [1], [2], citations list, and proposedAction.
    Otherwise, returns deterministic plain text for retrieval evaluation.
    """
    system_text = next((m.content for m in messages if m.role == "system"), "")
    user_text = next((m.content for m in reversed(messages) if m.role == "user"), "")

    is_structured = any(
        kw in system_text
        for kw in ("schema", "JSON", "json", "BASE_INSTRUCTIONS", "policy_query", "citations")
    )

    if is_structured:
        user_lower = user_text.lower()
        is_out_of_scope = any(
            kw in user_lower
            for kw in ("tàu con thoi", "iss", "không gian", "trạm không gian", "vũ trụ")
        )

        if is_out_of_scope:
            return json.dumps(
                {
                    "intent": "policy_query",
                    "reply": "Chưa có đủ bằng chứng trong tài liệu chính sách đang lưu để trả lời câu hỏi này.",
                    "citations": [],
                    "proposedAction": None,
                },
                ensure_ascii=False,
            )

        citations: list[str] = []
        if any(kw in user_lower for kw in ("lương", "công", "trễ", "muộn", "chấm công", "bảng công", "ca trực", "vắng", "nghỉ", "đổi ca")):
            citations.append("attendance")
        if any(kw in user_lower for kw in ("két", "quỹ", "tiền", "thực đếm", "thu ngân", "pos", "chênh lệch")):
            citations.append("cash")
        if any(kw in user_lower for kw in ("bàn giao công việc", "bb-cv", "nghỉ việc")):
            citations.append("bb_cong_viec")
        if any(kw in user_lower for kw in ("bàn giao tài sản", "bb-ts", "máy móc", "thiết bị", "công cụ")):
            citations.append("bb_tai_san")
        if any(kw in user_lower for kw in ("tác phong", "đồng phục", "phục vụ")):
            citations.append("service")

        if not citations:
            matched_ids = re.findall(r"\[([a-zA-Z0-9_\-]+)\] Document:", system_text)
            if matched_ids:
                citations.append(matched_ids[0])
            else:
                citations.append("attendance")

        reply = (
            "Theo tài liệu chính sách đang lưu: Chu kỳ tính lương chốt bảng công vào ngày 25 hàng tháng. "
            "Nhân viên tuân thủ đầy đủ quy định ca kíp và chấm công [1] [2]."
        )

        proposed_action = None
        intent = "policy_query"
        if "đổi ca" in user_lower:
            intent = "shift_operation"
            proposed_action = {
                "type": "request_shift_swap",
                "preview": "Đổi ca làm việc theo yêu cầu",
            }

        return json.dumps(
            {
                "intent": intent,
                "reply": reply,
                "citations": citations,
                "proposedAction": proposed_action,
            },
            ensure_ascii=False,
        )

    evidence: list[tuple[str, str]] = []
    for line in user_text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("["):
            continue
        marker, _, rest = stripped.partition("]")
        if not rest or not rest.strip():
            continue
        evidence.append((marker.lstrip("[") or "1", rest.strip()))
    if not evidence:
        return "Chưa có đủ bằng chứng trong tài liệu chính sách đang lưu để trả lời câu hỏi này."
    lines = [_MOCK_ANSWER_HEADER]
    for number, text in evidence[:3]:
        lines.append(f"- ({text}) [{number}]")
    return "\n".join(lines)
