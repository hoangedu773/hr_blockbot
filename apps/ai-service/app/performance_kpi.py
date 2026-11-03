"""Advisory performance helpers. Scores and responsibility remain API-owned."""
from __future__ import annotations
import json
import re
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.kpi_analysis import _parse_json
from app.llm.base import ChatMessage, CompletionOptions
from app.llm.chain import provider_cache


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Step(Strict):
    code: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=2, max_length=200)
    progressWeightPercent: float = Field(ge=0, le=100, allow_inf_nan=False)
    required: bool


class Quality(Strict):
    code: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=2, max_length=200)
    maxScore: float = Field(gt=0, le=100, allow_inf_nan=False)
    mandatory: bool
    description: str = Field(max_length=2000)
    evidenceRequired: bool


class Evidence(Strict):
    code: str
    name: str
    required: bool


class Content(Strict):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]+$")
    name: str = Field(min_length=2, max_length=200)
    steps: list[Step] = Field(min_length=1, max_length=30)
    qualityCriteria: list[Quality] = Field(min_length=4, max_length=30)
    requiredEvidence: list[Evidence] = Field(max_length=20)
    effectiveFrom: str = Field(pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")
    effectiveTo: str | None

    @model_validator(mode="after")
    def rubric(self):
        for rows, key in [(self.steps, "progressWeightPercent"), (self.qualityCriteria, "maxScore")]:
            if abs(sum(getattr(r, key) for r in rows) - 100) > .01 or len({r.code for r in rows}) != len(rows):
                raise ValueError("Invalid independent weight set")
        if not {"completeness", "accuracy", "timeliness", "evidence"} <= {r.code for r in self.qualityCriteria if r.mandatory}:
            raise ValueError("Missing mandatory rubric dimensions")
        return self


class SuggestTaskStructureRequest(Strict):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(max_length=10000)
    role: Literal["STAFF", "PTCH", "SM"]
    template: Content
    providerConfig: dict[str, Any] | None = None

    @model_validator(mode="after")
    def private_text(self):
        if re.search(r"salary|bank|cccd|phone|password|token|lương|ngân hàng|căn cước|mật khẩu|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?84|0)\d[\d .-]{7,}|\b\d{12}\b", self.title + " " + self.description, re.I):
            raise ValueError("Personal or secret data is not needed")
        return self


class SuggestTaskStructureResponse(Strict):
    content: Content
    rationale: str = Field(max_length=2000)
    confidence: Literal["low", "medium", "high"]
    model: str = Field(max_length=120)
    degraded: bool


class CriterionInput(Strict):
    alias: str = Field(pattern=r"^c\d+$")
    score: float | None = Field(ge=0, le=100, allow_inf_nan=False)
    evidenceCount: int = Field(ge=0, le=30)
    notApplicable: bool


class TaskInput(Strict):
    alias: str = Field(pattern=r"^t\d+$")
    score: float | None = Field(ge=0, le=100, allow_inf_nan=False)
    inclusion: Literal["INCLUDED", "EXCLUDED", "PENDING_DISPUTE"]
    evidenceCount: int = Field(ge=0, le=30)
    pending: bool


class SummarizeEvaluationRequest(Strict):
    status: Literal["OPEN", "SELF_REVIEW", "MANAGER_REVIEW", "PROVISIONAL", "PENDING_DISPUTE", "FINAL", "CORRECTED"]
    criteria: list[CriterionInput] = Field(max_length=20)
    tasks: list[TaskInput] = Field(max_length=500)
    providerConfig: dict[str, Any] | None = None


class Anomaly(Strict):
    code: str
    taskAlias: str | None
    severity: Literal["low", "medium", "high"]


class SummarizeEvaluationResponse(Strict):
    summary: str = Field(max_length=4000)
    missingEvidence: list[str] = Field(max_length=100)
    suggestedComments: list[str] = Field(max_length=30)
    anomalies: list[Anomaly] = Field(max_length=100)
    model: str = Field(max_length=120)
    degraded: bool


class ExplainTerm(Strict):
    alias: str = Field(pattern=r"^t\d+$")
    weight: float = Field(ge=0, le=100, allow_inf_nan=False)
    score: float | None = Field(ge=0, le=100, allow_inf_nan=False)
    included: bool


class ExplainKpiRequest(Strict):
    status: Literal["OPEN", "SELF_REVIEW", "MANAGER_REVIEW", "PROVISIONAL", "PENDING_DISPUTE", "FINAL", "CORRECTED"]
    terms: list[ExplainTerm] = Field(max_length=500)
    providerConfig: dict[str, Any] | None = None


class ExplainKpiResponse(Strict):
    summary: str
    model: str
    degraded: bool


def suggest_structure(request: SuggestTaskStructureRequest) -> dict:
    fallback = {"content": request.template.model_dump(), "rationale": "Gợi ý từ mẫu chuẩn; HR cần phê duyệt trước khi dùng.", "confidence": "low", "model": "template-fallback-v2", "degraded": True}
    try:
        chain = provider_cache.get(request.providerConfig) if request.providerConfig else None
        if not chain:
            return fallback
        result = chain.complete([ChatMessage("system", "Chỉ đề xuất cấu trúc nhiệm vụ từ mẫu. Trả JSON content,rationale,confidence. Giữ bốn chiều rubric completeness,accuracy,timeliness,evidence; tổng rubric và bước riêng bằng 100. Không chấm điểm, không giao việc, không publish; người quản lý/HR duyệt."), ChatMessage("user", json.dumps(request.model_dump(exclude={"providerConfig"}), ensure_ascii=False))], CompletionOptions(temperature=0, max_tokens=2000))
        body = _parse_json(result.text)
        body.update(model=(result.model or "configured-llm")[:120], degraded=False)
        return SuggestTaskStructureResponse.model_validate(body).model_dump()
    except Exception:
        return fallback


def summarize_evaluation(request: SummarizeEvaluationRequest) -> dict:
    missing = [c.alias for c in request.criteria if c.score is not None and not c.evidenceCount]
    anomalies = [{"code": "HIGH_SCORE_NO_EVIDENCE", "taskAlias": t.alias, "severity": "medium"} for t in request.tasks if t.score is not None and t.score >= 80 and not t.evidenceCount]
    fallback = {"summary": "Đối chiếu bằng chứng và phần trách nhiệm; dữ liệu tạm không phải kết quả chính thức.", "missingEvidence": missing, "suggestedComments": ["Kiểm tra bằng chứng và hạn nộp trước khi chấm."], "anomalies": anomalies, "model": "evidence-summary-v2", "degraded": True}
    try:
        chain = provider_cache.get(request.providerConfig) if request.providerConfig else None
        if not chain:
            return fallback
        result = chain.complete([ChatMessage("system", "Chỉ tóm tắt dữ liệu alias được cung cấp. JSON summary,missingEvidence,suggestedComments,anomalies (code,taskAlias,severity low|medium|high). Không trả điểm cuối, không sửa điểm rubric, không quyết loại nhiệm vụ, không kết luận gian lận; chỉ gắn cờ để HR xem xét."), ChatMessage("user", json.dumps(request.model_dump(exclude={"providerConfig"}), ensure_ascii=False))], CompletionOptions(temperature=0, max_tokens=1200))
        body = _parse_json(result.text)
        body.update(model=(result.model or "configured-llm")[:120], degraded=False)
        return SummarizeEvaluationResponse.model_validate(body).model_dump()
    except Exception:
        return fallback


def explain_kpi(request: ExplainKpiRequest) -> dict:
    # Grounded arithmetic is deliberately deterministic, never LLM-scored.
    rows = [t for t in request.terms if t.included]
    total = sum(t.weight for t in rows)
    value = round(sum(t.weight * t.score for t in rows) / total, 2) if total and all(t.score is not None for t in rows) else None
    final = request.status in ("FINAL", "CORRECTED")
    summary = ("Điểm chính thức" if final else "Điểm tạm tính") + ": " + (str(value) if value is not None else "chưa đủ dữ liệu") + ". "
    summary += "; ".join(f"{t.alias}: {t.weight}% × {t.score}" for t in rows)
    summary += ". Chỉ được loại nhiệm vụ khi có căn cứ miễn/chuyển trách nhiệm đã phê duyệt."
    return ExplainKpiResponse(summary=summary, model="stored-evidence-v2", degraded=False).model_dump()
