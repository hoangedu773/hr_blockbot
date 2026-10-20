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
import math

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

    The answer pipeline numbers evidence as `[n] document (version) - article: text`,
    so this mock is deterministic and always citation-verifiable.
    """
    user_text = next((m.content for m in reversed(messages) if m.role == "user"), "")
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
