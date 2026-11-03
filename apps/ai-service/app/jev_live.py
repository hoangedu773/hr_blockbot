"""Opt-in live Jev System One adapter for the authorization gateway.

This module is deliberately independent from ``app.agent`` and the legacy Mongo
runtime. The API must complete scoped preflight before calling this adapter.
"""
from __future__ import annotations

import math
import os
import time
import uuid
import re
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.deadline import remaining_seconds

INTENTS = {"policy_query", "shift_operation", "cash_audit", "general_chat"}


class LiveDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: str
    needs_manager_approval: float = Field(ge=0, le=1)
    incident_urgency: float = Field(ge=0, le=1)
    intent_confidence: float = Field(ge=0, le=1, default=0)
    intent_probabilities: dict[str, float] = Field(default_factory=dict)

    @field_validator("intent")
    @classmethod
    def valid_intent(cls, value: str) -> str:
        if value not in INTENTS:
            raise ValueError("Unsupported Jev intent")
        return value

    @field_validator("needs_manager_approval", "incident_urgency", "intent_confidence", mode="before")
    @classmethod
    def finite_number(cls, value: Any) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise ValueError("Expected finite numeric probability")
        return float(value)

    @field_validator("intent_probabilities", mode="before")
    @classmethod
    def valid_probabilities(cls, value: Any) -> dict[str, float]:
        if not isinstance(value, dict):
            raise ValueError("Expected probability object")
        output: dict[str, float] = {}
        for key, item in value.items():
            if key not in INTENTS or isinstance(item, bool) or not isinstance(item, (int, float)):
                raise ValueError("Invalid intent probability")
            number = float(item)
            if not math.isfinite(number) or not 0 <= number <= 1:
                raise ValueError("Invalid intent probability")
            output[key] = number
        return output


def _questions() -> dict[str, dict[str, Any]]:
    return {
        "intent": {
            "type": "choice",
            "instructions": "Phân loại ý định người dùng.",
            "criteria": {
                "policy_query": "Hỏi quy định, nội quy, mức phạt, thưởng, tiêu chuẩn phục vụ; không yêu cầu thao tác.",
                "shift_operation": "Yêu cầu đổi ca, xin nghỉ/vắng ca, thao tác lịch làm việc.",
                "cash_audit": "Sự cố hoặc yêu cầu kiểm quỹ, giải trình chênh lệch tiền két.",
                "general_chat": "Chào hỏi, trò chuyện hoặc câu hỏi chung khác.",
            },
        },
        "needs_manager_approval": {
            "type": "noul",
            "instructions": "Hành động có cần Cửa hàng trưởng SM duyệt không?",
            "criteria": {"true": "Cần phê duyệt thao tác đổi ca/giải trình quỹ.", "false": "Chỉ hỏi thông tin/trò chuyện."},
        },
        "incident_urgency": {
            "type": "score",
            "instructions": "Mức khẩn cấp của sự cố (0 bình thường, 1 nguy hiểm tức thì).",
            "criteria": ["Bình thường", "Nguy hiểm tức thì"],
        },
    }


def _extract(body: Any) -> LiveDecision:
    answers = body["data"]["result"]["answers"]
    for name, kind in (("intent", "choice"), ("needs_manager_approval", "noul"), ("incident_urgency", "score")):
        if not isinstance(answers.get(name), dict) or answers[name].get("type") != kind:
            raise ValueError("Invalid decision primitive")
    intent = answers["intent"]
    probabilities = intent.get("probabilities") or {}
    return LiveDecision.model_validate({
        "intent": intent.get("choice"),
        "needs_manager_approval": answers["needs_manager_approval"].get("noul"),
        "incident_urgency": answers["incident_urgency"].get("score"),
        "intent_confidence": intent.get("confidence") or 0,
        "intent_probabilities": probabilities,
    })


def _usejevai_questions() -> list[dict[str, Any]]:
    questions = []
    for name, item in _questions().items():
        criteria = item.get("criteria", {})
        options = []
        if item["type"] == "choice":
            options = [{"label": label, "description": description} for label, description in criteria.items()]
        elif item["type"] == "score":
            options = [{"label": str(index), "description": description} for index, description in enumerate(criteria)]
        questions.append({"id": name, "type": item["type"], "instructions": item["instructions"], "options": options})
    return questions


def _usejevai(client: httpx.Client, key: str, message: str, budget: float) -> LiveDecision:
    """One idempotent submission; poll the same run, never resubmit on uncertainty."""
    expiry = time.monotonic() + budget
    def timeout() -> float:
        value = remaining_seconds(expiry - time.monotonic())
        if value <= 0:
            raise TimeoutError("Decision deadline exceeded")
        return value
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    response = client.post("https://usejevai.com/api/v1/runs", headers=headers, timeout=timeout(), json={
        "funding": "prefer_trial", "idempotencyKey": uuid.uuid4().hex,
        "input": {"state": message, "questions": _usejevai_questions()},
    })
    response.raise_for_status()
    submitted = response.json()
    if submitted.get("code") != 0:
        raise ValueError("UseJevAI rejected submission")
    run_id = submitted["data"]["id"]
    if not isinstance(run_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", run_id):
        raise ValueError("Invalid run identifier")
    while True:
        response = client.get("https://usejevai.com/api/v1/runs/" + run_id, headers=headers, timeout=timeout())
        response.raise_for_status()
        body = response.json()
        if body.get("code") != 0:
            raise ValueError("UseJevAI run unavailable")
        data = body["data"]
        if data.get("status") == "succeeded":
            timeout()  # Reject late results under the same overall budget.
            return _extract({"data": {"result": {"answers": data["result"]["response"]["answers"]}}})
        if data.get("status") not in ("queued", "running"):
            raise ValueError("UseJevAI run did not succeed")
        time.sleep(min(0.25, timeout()))


def analyze_live(message: str, deadline_at_ms: int | None = None) -> dict[str, Any]:
    """Call Jev only when operators explicitly enable LIVE and external text."""
    if os.getenv("JEV_V1_MODE", "OFF").strip().upper() != "LIVE":
        return {"mode": "LIVE", "status": "not_configured", "execution": "none", "source": None}
    if os.getenv("JEV_LIVE_ALLOW_EXTERNAL_TEXT", "false").strip().lower() != "true":
        return {"mode": "LIVE", "status": "external_text_disabled", "execution": "none", "source": None}
    provider = os.getenv("JEV_V1_PROVIDER", "thejevai").strip().lower()
    if provider not in ("thejevai", "usejevai"):
        return {"mode": "LIVE", "status": "not_configured", "execution": "none", "source": None}
    key = (((os.getenv("USEJEVAI_API_KEY") or os.getenv("JEV_API_KEY")) if provider == "usejevai" else os.getenv("JEV_API_KEY")) or "").strip()
    if len(key) < 16:
        return {"mode": "LIVE", "status": "not_configured", "execution": "none", "source": None}
    timeout = remaining_seconds(6.0 if deadline_at_ms is None else min(6.0, max(0.1, (deadline_at_ms - time.time() * 1000) / 1000)))
    payload = {"model": os.getenv("JEV_MODEL", "typesafe/jev-1.14"), "state": message, "questions": _questions()}
    started = time.monotonic()
    try:
        with httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False) as client:
            if provider == "usejevai":
                decision = _usejevai(client, key, message, timeout)
            else:
                response = client.post("https://thejevai.com/v1/systemone", json=payload,
                                       headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
                response.raise_for_status()
                body = response.json()
                if body.get("code") != 0:
                    raise ValueError("Jev rejected request")
                decision = _extract(body)
        return {"mode": "LIVE", "status": "ok", "execution": "live", "source": "jev_usejevai" if provider == "usejevai" else "jev_systemone",
                "intent": decision.intent, "needsManagerApprovalProbability": decision.needs_manager_approval,
                "incidentUrgency": decision.incident_urgency, "intentConfidence": decision.intent_confidence,
                "intentProbabilities": decision.intent_probabilities,
                "latencyMs": min(15000, max(0, round((time.monotonic() - started) * 1000)))}
    except (httpx.HTTPError, RuntimeError, TimeoutError, ValueError, KeyError, TypeError, AttributeError, ValidationError):
        return {"mode": "LIVE", "status": "unavailable", "execution": "none", "source": None}


def live_mode_enabled() -> bool:
    return os.getenv("JEV_V1_MODE", "OFF").strip().upper() == "LIVE"
