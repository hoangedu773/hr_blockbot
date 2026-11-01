"""V1 SHADOW adapter. Only explicit synthetic fixtures + HTTP MockTransport.

There is deliberately no env-key lookup or live transport constructor. Real
messages, even after regex masking, are NOT authorized for external analysis.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
import os
import threading
import time

import anyio
import httpx

from app.deadline import remaining_seconds, use_deadline

INTENTS = frozenset(("policy_query", "shift_operation", "cash_audit", "general_chat"))
_workers = threading.BoundedSemaphore(4)


def shadow_mode() -> str:
    mode = (os.getenv("JEV_V1_MODE") or "OFF").strip().upper()
    if mode not in ("OFF", "SHADOW"):
        raise ValueError("Unsupported V1 analysis mode")
    return mode


@dataclass(frozen=True)
class SyntheticMockConfig:
    # Install programmatically in a trusted test harness, never from HTTP/env URL.
    transport: httpx.MockTransport
    messages: frozenset[str]
    timeout_ms: int = 250

    def __post_init__(self) -> None:
        if type(self.transport) is not httpx.MockTransport or type(self.messages) is not frozenset:
            raise ValueError("Only explicit synthetic mock fixtures are supported")
        if not self.messages or any(type(text) is not str or not text.strip() or len(text) > 2000 for text in self.messages):
            raise ValueError("Invalid synthetic fixture")
        if type(self.timeout_ms) is not int or not 1 <= self.timeout_ms <= 2000:
            raise ValueError("Invalid mock analysis budget")


def unavailable(status: str) -> dict:
    return {"mode": "SHADOW", "status": status, "execution": "none", "source": None}


def eligible(config: SyntheticMockConfig | None, message: str) -> bool:
    return type(config) is SyntheticMockConfig and message in config.messages


async def analyze(config: SyntheticMockConfig, message: str) -> dict:
    if not eligible(config, message):
        return unavailable("skipped_data_policy")
    started = time.monotonic()
    try:
        # Reserve the remaining budget for the unchanged main answer path.
        budget = min(config.timeout_ms / 1000, remaining_seconds(15) / 4)
        with use_deadline(int(time.time() * 1000 + budget * 1000)), anyio.fail_after(budget):
            result = await anyio.to_thread.run_sync(lambda: _decide(config, message), abandon_on_cancel=True)
        latency = min(15000, max(0, round((time.monotonic() - started) * 1000)))
        return {**result, "latencyMs": latency}
    except Exception:
        # Never log/return prompt, exception text, upstream body, key or token.
        return unavailable("unavailable")


def _decide(config: SyntheticMockConfig, message: str) -> dict:
    if not _workers.acquire(blocking=False):
        raise RuntimeError("Analysis capacity unavailable")
    try:
        # Lazy imports: OFF doesn't initialize Jev. Settings() uses defaults,
        # NOT load_settings(), and contains only a fixed synthetic credential.
        from app.config import Settings
        from app.agent.jev_gateway import JevGateway, TypedDecision
        from app.llm.chain import ProviderChain
        fixture_settings = Settings(jev_api_key="synthetic-shadow-not-a-live-key", decision_timeout_ms=config.timeout_ms)
        with httpx.Client(transport=config.transport, follow_redirects=False, trust_env=False) as client:
            gateway = JevGateway(ProviderChain([]), client=client, settings_override=fixture_settings)
            decision = gateway.decide(message)
        typed = TypedDecision.model_validate(decision.model_dump())
        if typed.source != "jev_systemone" or set(typed.intent_probabilities) - INTENTS:
            raise ValueError("Unexpected analysis provenance or labels")
        numbers = (typed.needs_manager_approval, typed.incident_urgency, typed.intent_confidence, *typed.intent_probabilities.values())
        if any(type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1 for value in numbers):
            raise ValueError("Invalid analysis probabilities")
        return {"mode": "SHADOW", "status": "ok", "execution": "mock", "source": typed.source,
                "intent": typed.intent, "needsManagerApprovalProbability": typed.needs_manager_approval,
                "incidentUrgency": typed.incident_urgency, "intentConfidence": typed.intent_confidence,
                "intentProbabilities": typed.intent_probabilities}
    finally:
        _workers.release()
