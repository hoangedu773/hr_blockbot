"""F5 review semantics: LLM when configured, deterministic Vietnamese lexicon otherwise.

The model may only return the five agreed signals. It never returns a final KPI
score, and the caller (apps/api) computes `machineScore` deterministically.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.llm.base import ChatMessage, CompletionOptions, LLMUnavailable
from app.llm.chain import provider_cache


class ReviewItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["self", "manager"]
    text: str = Field(min_length=1, max_length=4000)


class Analysis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sentiment: Literal["positive", "neutral", "negative"]
    sentimentScore: float = Field(ge=-1, le=1)
    themes: list[str] = Field(max_length=8)
    riskSignals: list[str] = Field(max_length=8)
    suggestedScoreComponent: float = Field(ge=0, le=1)
    explanation: str = Field(min_length=1, max_length=2000)


POSITIVE = (
    "chăm chỉ", "nhiệt tình", "hoàn thành", "đúng hạn", "chất lượng", "hỗ trợ", "phối hợp",
    "sáng kiến", "trách nhiệm", "tốt", "xuất sắc", "chủ động", "cẩn thận", "đáng tin", "tiến bộ",
)
NEGATIVE = (
    "trễ", "muộn", "thiếu", "chưa hoàn thành", "chậm", "sai", "lỗi", "thái độ", "không hợp tác",
    "vắng", "cẩu thả", "khiếu nại", "quá hạn", "tái diễn", "vi phạm", "bỏ dở",
)
RISKS = (
    "đi muộn", "đi trễ", "vắng", "chưa hoàn thành", "quá hạn", "thiếu minh chứng",
    "không báo cáo", "tái diễn", "vi phạm", "khiếu nại", "bỏ dở",
)
THEMES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Chất lượng công việc", ("chất lượng", "lỗi", "chính xác", "hoàn thiện", "sai sót")),
    ("Tiến độ", ("hạn", "tiến độ", "deadline", "trễ", "muộn", "chậm")),
    ("Tinh thần hợp tác", ("hỗ trợ", "phối hợp", "đồng đội", "team", "giúp")),
    ("Chủ động và sáng kiến", ("chủ động", "sáng kiến", "đề xuất", "cải tiến")),
    ("Kỷ luật", ("chấp hành", "nội quy", "giờ giấc", "vi phạm")),
    ("Giao tiếp", ("giao tiếp", "trao đổi", "báo cáo", "phản hồi")),
    ("Chuyên môn", ("kỹ năng", "chuyên môn", "nghiệp vụ", "tay nghề")),
)


def _normalise(text: str) -> str:
    return " ".join(text.lower().split())


def lexicon_analysis(reviews: list[ReviewItem]) -> Analysis:
    text = _normalise(" ".join(item.text for item in reviews))
    positive = sum(1 for word in POSITIVE if word in text)
    negative = sum(1 for word in NEGATIVE if word in text)
    score = max(-1.0, min(1.0, (positive - negative) / max(1, positive + negative)))
    risks = [phrase for phrase in RISKS if phrase in text][:8]
    themes = [name for name, keys in THEMES if any(key in text for key in keys)][:8]
    suggested = 0.55 + 0.25 * score - 0.06 * len(risks)
    suggested = max(0.15, min(0.9, round(suggested, 3)))
    sentiment = "positive" if score > 0.15 else "negative" if score < -0.15 else "neutral"
    if not themes:
        themes = ["Chưa đủ tín hiệu chủ đề"]
    explanation = (
        f"Phân tích từ vựng dự phòng: {positive} tín hiệu tích cực, {negative} tín hiệu tiêu cực, "
        f"{len(risks)} rủi ro. Đây chỉ là tín hiệu tham khảo, không phải điểm KPI cuối."
    )
    return Analysis(sentiment=sentiment, sentimentScore=round(score, 3), themes=themes, riskSignals=risks,
                    suggestedScoreComponent=suggested, explanation=explanation)


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no json object")
    return json.loads(cleaned[start:end + 1])


SYSTEM = (
    "Bạn là bộ phân tích nhận xét đánh giá KPI nội bộ. Chỉ dựa trên văn bản được đưa. "
    "Trả về DUY NHẤT một JSON hợp lệ với các khóa: sentiment (positive|neutral|negative), "
    "sentimentScore (-1..1), themes (mảng tối đa 8 chuỗi ngắn tiếng Việt), riskSignals "
    "(mảng tối đa 8 chuỗi ngắn), suggestedScoreComponent (0..1), explanation (tiếng Việt, tối đa 600 ký tự). "
    "KHÔNG trả điểm KPI cuối, không bịa dữ kiện ngoài văn bản, không nhắc tên nhân viên."
)


def llm_analysis(reviews: list[ReviewItem], provider_config: dict[str, Any] | None) -> tuple[Analysis, str]:
    if not provider_config:
        raise LLMUnavailable([])
    chain = provider_cache.get(provider_config)
    if not chain:
        raise LLMUnavailable([])
    payload = "\n".join(f"[{item.role}] {item.text}" for item in reviews)
    result = chain.complete(
        [ChatMessage("system", SYSTEM), ChatMessage("user", payload)],
        CompletionOptions(temperature=0.0, max_tokens=800),
    )
    data = _parse_json(result.text)
    return Analysis.model_validate(data), result.model or "llm"


def analyze(reviews: list[ReviewItem], provider_config: dict[str, Any] | None) -> dict[str, Any]:
    analyzed_at = datetime.now(timezone.utc).isoformat()
    try:
        analysis, model = llm_analysis(reviews, provider_config)
        return {**analysis.model_dump(), "model": model[:120], "degraded": False, "analyzedAt": analyzed_at}
    except (LLMUnavailable, ValidationError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        analysis = lexicon_analysis(reviews)
        return {**analysis.model_dump(), "model": "lexicon-vi-v1", "degraded": True, "analyzedAt": analyzed_at}
