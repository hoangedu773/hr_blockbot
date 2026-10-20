"""Vietnamese-friendly text helpers shared by retrieval and the fake embedding provider.

No word segmentation dependency (the `TBD` PhoBERT segmentation step belongs to the
matching pipeline, not to policy RAG): policy chunks are already segmented by
punctuation, so syllable tokens are enough for BM25 and for the deterministic mock
embedder.
"""

from __future__ import annotations

import re
import unicodedata

_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_SPACE_RE = re.compile(r"\s+", re.UNICODE)

# Vietnamese function words removed before BM25 / mock-embedding scoring. Content
# words ("lương", "két", "ca", "đào tạo", …) are deliberately kept.
STOPWORDS = frozenset(
    {
        "và", "của", "là", "có", "cho", "khi", "trong", "với", "để", "thì", "mà",
        "như", "những", "các", "một", "này", "đó", "rằng", "nếu", "hoặc", "bị",
        "được", "ra", "vào", "lên", "xuống", "tôi", "bạn", "anh", "chị", "em",
        "bao", "lâu", "gì", "sao", "nào", "ai", "đâu", "thế", "cũng", "vẫn",
        "đã", "đang", "sẽ", "hãy", "hỏi", "xin", "về", "tại", "theo", "đối",
    }
)


def normalize_text(text: str) -> str:
    """NFC-normalise, lowercase and collapse whitespace. Never logs or mutates input."""
    if not text:
        return ""
    return _SPACE_RE.sub(" ", unicodedata.normalize("NFC", text).lower()).strip()


def tokenize(text: str, *, drop_stopwords: bool = False) -> list[str]:
    """Tokenise to lowercase word tokens, keeping Vietnamese diacritics."""
    clean = _WORD_RE.sub(" ", normalize_text(text))
    tokens = [token for token in clean.split(" ") if token]
    if drop_stopwords:
        return [token for token in tokens if token not in STOPWORDS]
    return tokens


def tokenize_with_bigrams(text: str, *, drop_stopwords: bool = False) -> list[str]:
    """Unigrams plus adjacent bigrams (used only by the deterministic mock embedder)."""
    tokens = tokenize(text, drop_stopwords=drop_stopwords)
    bigrams = [f"{a}_{b}" for a, b in zip(tokens, tokens[1:])]
    return tokens + bigrams


def truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1].rstrip() + "…"
