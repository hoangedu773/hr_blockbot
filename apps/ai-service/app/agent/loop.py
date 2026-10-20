"""Agent loop with the FR-019 guard: maxSteps=5, toolTimeout, LLM timeout.

The planner is deterministic by default (the intent catalog in `app/agent/router.py`),
because no live provider key exists yet: a model-driven tool-selection loop can be
plugged in by passing a `planner` callable. The guard is enforced here regardless of
planner, so a misbehaving planner cannot loop forever.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from app.agent.router import RouteDecision, classify, dashboard_reply
from app.agent.tools import ToolRuntime, UserContext
from app.config import settings
from app.llm.chain import ProviderChain
from app.rag.answer import AnswerResult, answer_policy

Planner = Callable[[str, UserContext, list[dict[str, Any]]], "RouteDecision | None"]


@dataclass
class AgentTurn:
    intent: str
    intent_id: str
    reply: str
    tool_name: str | None = None
    citations: list[dict[str, Any]] = field(default_factory=list)
    abstain: bool = False
    degraded: bool = False
    data: dict[str, Any] | None = None
    proposed_action: dict[str, Any] | None = None
    steps: int = 0
    guard_exceeded: bool = False
    provider_id: str | None = None
    answer_source: str | None = None
    error: dict[str, Any] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "intent": self.intent,
            "intentId": self.intent_id,
            "reply": self.reply,
            "tool": self.tool_name,
            "citations": self.citations,
            "abstain": self.abstain,
            "degraded": self.degraded,
            "data": self.data,
            "proposedAction": self.proposed_action,
            "steps": self.steps,
            "guardExceeded": self.guard_exceeded,
            "providerId": self.provider_id,
            "answerSource": self.answer_source,
            "error": self.error,
        }


class AgentLoop:
    def __init__(
        self,
        runtime: ToolRuntime,
        chain: ProviderChain | None = None,
        *,
        planner: Planner | None = None,
        max_steps: int | None = None,
        strict_provider: bool = False,
    ) -> None:
        self.runtime = runtime
        self.chain = chain
        self._planner = planner
        self.max_steps = settings.max_steps if max_steps is None else max_steps
        self.strict_provider = strict_provider

    # --- public entrypoint -------------------------------------------------------

    def run(self, message: str, user_ctx: UserContext) -> AgentTurn:
        text = (message or "").strip()
        if not text:
            return AgentTurn(
                intent="invalid",
                intent_id="-",
                reply="Vui lòng nhập câu hỏi rõ ràng.",
                error={"code": "EMPTY_MESSAGE", "retryable": False},
            )
        if len(text) > settings.request_max_chars:
            return AgentTurn(
                intent="invalid",
                intent_id="-",
                reply="Câu hỏi quá dài, vui lòng rút gọn.",
                error={"code": "MESSAGE_TOO_LONG", "retryable": False},
            )

        plan = self._plan(text, user_ctx, [])
        if plan is None:
            return AgentTurn(
                intent="unknown",
                intent_id="-",
                reply=dashboard_reply(classify(text)),
                error={"code": "NO_PLAN", "retryable": True},
            )

        if plan.is_policy:
            return self._policy_turn(plan, text, user_ctx)
        if plan.tool_name is None:
            return AgentTurn(
                intent=plan.intent,
                intent_id=plan.intent_id,
                reply=dashboard_reply(plan),
                steps=1,
            )
        return self._tool_turn(plan, text, user_ctx)

    # --- policy path -------------------------------------------------------------

    def _policy_turn(self, plan: RouteDecision, text: str, user_ctx: UserContext) -> AgentTurn:
        scope = {"departmentId": user_ctx.department_id} if user_ctx.department_id else None
        retrieval = self.runtime.policy.retrieve(text, k=settings.top_k, scope=scope)
        answer: AnswerResult = answer_policy(
            text,
            retrieval,
            self.chain,
            strict_provider=self.strict_provider,
        )
        return AgentTurn(
            intent=plan.intent,
            intent_id=plan.intent_id,
            reply=answer.answer,
            tool_name="search_policy",
            citations=answer.citations,
            abstain=answer.abstained,
            degraded=answer.degraded,
            steps=1,
            provider_id=answer.provider_id,
            answer_source=answer.answer_source,
        )

    # --- tool path (guard: maxSteps) --------------------------------------------

    def _tool_turn(self, plan: RouteDecision, text: str, user_ctx: UserContext) -> AgentTurn:
        results: list[dict[str, Any]] = []
        current: RouteDecision | None = plan
        steps = 0
        while current is not None and current.tool_name is not None and steps < self.max_steps:
            steps += 1
            outcome = self.runtime.execute(current.tool_name, current.args, user_ctx)
            results.append(outcome)
            current = self._plan(text, user_ctx, results)

        if current is not None and current.tool_name is not None:
            return AgentTurn(
                intent=plan.intent,
                intent_id=plan.intent_id,
                reply=(
                    f"Mình chưa hoàn tất sau {self.max_steps} bước (giới hạn maxSteps). "
                    "Đây là phần đã tra được; bạn có thể hỏi lại cụ thể hơn."
                ),
                tool_name=plan.tool_name,
                data=results[-1] if results else None,
                steps=steps,
                guard_exceeded=True,
                error={"code": "MAX_STEPS", "retryable": True},
            )

        last = results[-1] if results else {}
        status = last.get("status")
        proposed = last.get("proposedAction")
        if status == "success":
            reply = last.get("summary") or "Đã tra cứu xong."
        elif status == "proposed":
            reply = last.get("summary") or "Đã chuẩn bị đề xuất, cần bạn xác nhận."
        elif status in ("denied", "locked"):
            reply = last.get("message") or "Bạn không có quyền thực hiện yêu cầu này."
        elif status == "not_found":
            reply = last.get("message") or "Không tìm thấy dữ liệu phù hợp."
        else:
            reply = last.get("message") or "Không tra cứu được dữ liệu, vui lòng thử lại."

        return AgentTurn(
            intent=plan.intent,
            intent_id=plan.intent_id,
            reply=reply,
            tool_name=plan.tool_name,
            data=last,
            proposed_action=proposed,
            steps=steps,
            error=None
            if status in ("success", "proposed")
            else {"code": last.get("code", "TOOL_ERROR"), "retryable": status not in ("denied", "locked")},
        )

    # --- planner -----------------------------------------------------------------

    def _plan(
        self, message: str, user_ctx: UserContext, results: list[dict[str, Any]]
    ) -> RouteDecision | None:
        if self._planner is not None:
            return self._planner(message, user_ctx, results)
        # Deterministic default: one tool, then compose from the result.
        if results:
            return None
        return classify(message)
