"""Gemini provider: `generateContent` + `batchEmbedContents`.

API key travels in the `x-goog-api-key` header (not the query string) so it never
lands in URL logs.
"""

from __future__ import annotations

import json
from typing import AsyncIterator

import httpx
from app.deadline import remaining_seconds

from app.llm.base import (
    ChatMessage,
    CompletionOptions,
    CompletionResult,
    EmbeddingResult,
    LLMProvider,
    ProviderConfig,
    ProviderError,
    ProviderInvalidConfig,
    ProviderRateLimited,
    ProviderSafetyBlocked,
    ProviderTimeout,
    ToolCall,
    aparse_sse_stream,
)
from app.llm.url_guard import validate_base_url

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

_GEMINI_SAFETY_FINISH_REASONS = {
    "SAFETY",
    "IMAGE_SAFETY",
    "RECITATION",
    "BLOCKLIST",
    "PROHIBITED_CONTENT",
    "SPII",
}

def _is_safety_payload(body: dict) -> bool:
    prompt = body.get("promptFeedback")
    if isinstance(prompt, dict) and prompt.get("blockReason"):
        return True
    error = body.get("error")
    if isinstance(error, dict):
        if str(error.get("status") or "").upper() in {"SAFETY", "IMAGE_SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}:
            return True
        details = error.get("details")
        if isinstance(details, list) and any("safety" in str(item).lower() or "recitation" in str(item).lower() for item in details):
            return True
    for candidate in body.get("candidates") or []:
        reason = str(candidate.get("finishReason") or "").upper() if isinstance(candidate, dict) else ""
        if reason in _GEMINI_SAFETY_FINISH_REASONS or "SAFETY" in reason:
            return True
    return False


class GeminiProvider(LLMProvider):
    def __init__(
        self,
        config: ProviderConfig,
        client: httpx.Client | httpx.AsyncClient | None = None,
        async_client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(config)
        if not config.api_key:
            raise ProviderInvalidConfig("apiKey is required for gemini", provider_id=config.id)
        self._base_url = validate_base_url(
            config.base_url or DEFAULT_BASE_URL, provider_id=config.id
        ).rstrip("/")
        if isinstance(client, httpx.AsyncClient):
            self._async_client = client
            self._client = httpx.Client(timeout=self.timeout)
        else:
            self._client = client or httpx.Client(timeout=self.timeout)
            self._async_client = async_client

    def _headers(self) -> dict[str, str]:
        return {"Content-Type": "application/json", "x-goog-api-key": self.config.api_key or ""}

    def _post(self, url: str, payload: dict) -> dict:
        try:
            response = self._client.post(url, json=payload, headers=self._headers(), timeout=remaining_seconds(self.timeout))
            remaining_seconds(self.timeout)
        except (httpx.TimeoutException, TimeoutError) as exc:
            raise ProviderTimeout("provider timed out", provider_id=self.config.id) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"transport error: {type(exc).__name__}", provider_id=self.config.id) from exc

        if response.status_code == 429:
            raise ProviderRateLimited("provider rate limited", provider_id=self.config.id)
        if response.status_code >= 400:
            try:
                error_body = response.json()
            except ValueError:
                error_body = {}
            if _is_safety_payload(error_body):
                raise ProviderSafetyBlocked("gemini safety filter triggered", provider_id=self.config.id)
            raise ProviderError(f"provider returned HTTP {response.status_code}", provider_id=self.config.id)
        try:
            return response.json()
        except ValueError as exc:
            raise ProviderError("provider returned invalid JSON", provider_id=self.config.id) from exc

    def complete(
        self,
        messages: list[ChatMessage],
        opts: CompletionOptions | None = None,
    ) -> CompletionResult:
        opts = opts or CompletionOptions()
        system_parts = [m.content for m in messages if m.role == "system"]
        contents = [
            {
                "role": "model" if m.role == "assistant" else "user",
                "parts": [{"text": m.content}],
            }
            for m in messages
            if m.role in ("user", "assistant")
        ]
        payload: dict = {
            "contents": contents,
            "generationConfig": {
                "temperature": opts.temperature,
                "maxOutputTokens": opts.max_tokens or self.config.max_tokens,
                # gemini-3-flash-preview is a thinking model: with the default
                # thinking budget a policy prompt (large in-context injection)
                # takes 40+s before the first token. thinkingBudget=0 disables
                # deliberation — measured 3.2s vs 40s on the same prompt.
                "thinkingConfig": {"thinkingBudget": 0},
            },
        }
        if system_parts:
            payload["systemInstruction"] = {"parts": [{"text": "\n".join(system_parts)}]}
        if opts.tools:
            payload["tools"] = [
                {
                    "functionDeclarations": [
                        {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.parameters,
                        }
                        for tool in opts.tools
                    ]
                }
            ]

        url = f"{self._base_url}/models/{self.config.model}:generateContent"
        data = self._post(url, payload)
        if _is_safety_payload(data):
            raise ProviderSafetyBlocked("gemini safety filter triggered", provider_id=self.config.id)
        try:
            candidate = data["candidates"][0]
            finish_reason = str(candidate.get("finishReason") or "").upper()
            if finish_reason in _GEMINI_SAFETY_FINISH_REASONS or "SAFETY" in finish_reason:
                raise ProviderSafetyBlocked("gemini safety filter triggered", provider_id=self.config.id)
            parts = (candidate.get("content") or {}).get("parts") or []
        except ProviderSafetyBlocked:
            raise
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("provider response missing candidates", provider_id=self.config.id) from exc

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for part in parts:
            if isinstance(part.get("text"), str):
                text_parts.append(part["text"])
            call = part.get("functionCall")
            if isinstance(call, dict) and call.get("name"):
                arguments = call.get("args")
                tool_calls.append(ToolCall(name=str(call["name"]), arguments=arguments or {}))
        usage = data.get("usageMetadata") or {}
        return CompletionResult(
            text="".join(text_parts),
            model=self.config.model,
            provider_id=self.config.id,
            tokens_in=int(usage.get("promptTokenCount") or 0),
            tokens_out=int(usage.get("candidatesTokenCount") or 0),
            tool_calls=tool_calls,
        )

    def embed(self, texts: list[str], opts: dict | None = None) -> EmbeddingResult:
        requests = [
            {"model": f"models/{self.config.model}", "content": {"parts": [{"text": text}]}}
            for text in texts
        ]
        url = f"{self._base_url}/models/{self.config.model}:batchEmbedContents"
        data = self._post(url, {"requests": requests})
        try:
            vectors = [item["values"] for item in data["embeddings"]]
        except (KeyError, TypeError) as exc:
            raise ProviderError("provider response missing embeddings", provider_id=self.config.id) from exc
        if len(vectors) != len(texts):
            raise ProviderError("provider returned wrong number of embeddings", provider_id=self.config.id)
        return EmbeddingResult(
            vectors=[[float(value) for value in vector] for vector in vectors],
            model=self.config.model,
            provider_id=self.config.id,
        )

    async def stream(
        self,
        messages: list[ChatMessage],
        opts: CompletionOptions | None = None,
    ) -> AsyncIterator[str]:
        opts = opts or CompletionOptions()
        system_parts = [m.content for m in messages if m.role == "system"]
        contents = [
            {
                "role": "model" if m.role == "assistant" else "user",
                "parts": [{"text": m.content}],
            }
            for m in messages
            if m.role in ("user", "assistant")
        ]
        payload: dict = {
            "contents": contents,
            "generationConfig": {
                "temperature": opts.temperature,
                "maxOutputTokens": opts.max_tokens or self.config.max_tokens,
                "thinkingConfig": {"thinkingBudget": 0},
            },
        }
        if system_parts:
            payload["systemInstruction"] = {"parts": [{"text": "\n".join(system_parts)}]}
        if opts.tools:
            payload["tools"] = [
                {
                    "functionDeclarations": [
                        {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.parameters,
                        }
                        for tool in opts.tools
                    ]
                }
            ]

        url = f"{self._base_url}/models/{self.config.model}:streamGenerateContent?alt=sse"
        client = self._async_client
        owned_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=self.timeout)
            owned_client = True

        try:
            timeout = remaining_seconds(self.timeout)
            async with client.stream(
                "POST",
                url,
                json=payload,
                headers=self._headers(),
                timeout=timeout,
            ) as response:
                remaining_seconds(self.timeout)
                if response.status_code == 429:
                    raise ProviderRateLimited("provider rate limited", provider_id=self.config.id)
                if response.status_code >= 400:
                    raise ProviderError(f"provider returned HTTP {response.status_code}", provider_id=self.config.id)

                saw_terminal = False
                async for raw_event in aparse_sse_stream(response.aiter_bytes()):
                    remaining_seconds(self.timeout)
                    stripped = raw_event.strip()
                    if not stripped:
                        continue
                    try:
                        data = json.loads(raw_event)
                    except ValueError as exc:
                        raise ProviderError("malformed SSE event JSON from gemini", provider_id=self.config.id) from exc

                    if data.get("error"):
                        err = data["error"]
                        err_str = str(err).upper()
                        if "SAFETY" in err_str or "PROHIBITED" in err_str or "BLOCKLIST" in err_str:
                            raise ProviderSafetyBlocked("gemini safety filter triggered", provider_id=self.config.id)
                        code = err.get("code") if isinstance(err, dict) else None
                        if code == 429 or "RESOURCE_EXHAUSTED" in err_str:
                            raise ProviderRateLimited("provider rate limited", provider_id=self.config.id)
                        raise ProviderError("gemini returned stream error", provider_id=self.config.id)

                    prompt_feedback = data.get("promptFeedback") or {}
                    if prompt_feedback.get("blockReason"):
                        raise ProviderSafetyBlocked("gemini blocked prompt", provider_id=self.config.id)

                    candidates = data.get("candidates")
                    if not candidates and not prompt_feedback:
                        continue

                    for candidate in candidates or []:
                        finish_reason = candidate.get("finishReason")
                        if finish_reason:
                            fr_str = str(finish_reason).upper()
                            if fr_str in _GEMINI_SAFETY_FINISH_REASONS or "SAFETY" in fr_str:
                                raise ProviderSafetyBlocked(
                                    "gemini safety filter triggered",
                                    provider_id=self.config.id,
                                )
                            if fr_str in ("STOP", "MAX_TOKENS"):
                                saw_terminal = True
                            else:
                                raise ProviderError(
                                    "gemini non-terminal finishReason",
                                    provider_id=self.config.id,
                                )

                        content = candidate.get("content") or {}
                        parts = content.get("parts") or []
                        for part in parts:
                            if not isinstance(part, dict):
                                continue
                            if part.get("thought"):
                                continue
                            if part.get("functionCall"):
                                continue
                            text = part.get("text")
                            if isinstance(text, str) and text:
                                yield text

                if not saw_terminal:
                    raise ProviderError("stream truncated before terminal success", provider_id=self.config.id)

        except (httpx.TimeoutException, TimeoutError) as exc:
            raise ProviderTimeout("provider timed out", provider_id=self.config.id) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"transport error: {type(exc).__name__}", provider_id=self.config.id) from exc
        finally:
            if owned_client:
                await client.aclose()
