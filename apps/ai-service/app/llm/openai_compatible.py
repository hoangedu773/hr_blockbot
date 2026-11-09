"""OpenAI-compatible provider: `/chat/completions` + `/embeddings`.

Covers OpenAI, Groq, DeepSeek, OpenRouter, vLLM and Ollama's OpenAI-compatible API.
`baseUrl` must include the API version prefix (e.g. `https://api.openai.com/v1`);
the adapter appends `/chat/completions` and `/embeddings`.
"""

from __future__ import annotations

import json
import logging
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

logger = logging.getLogger("ai.llm.openai_compatible")


class OpenAICompatibleProvider(LLMProvider):
    def __init__(
        self,
        config: ProviderConfig,
        client: httpx.Client | httpx.AsyncClient | None = None,
        async_client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(config)
        if not config.base_url:
            raise ProviderInvalidConfig("baseUrl is required", provider_id=config.id)
        self._base_url = validate_base_url(config.base_url, provider_id=config.id).rstrip("/")
        if isinstance(client, httpx.AsyncClient):
            self._async_client = client
            self._client = httpx.Client(timeout=self.timeout)
        else:
            self._client = client or httpx.Client(timeout=self.timeout)
            self._async_client = async_client

    def _url(self, suffix: str) -> str:
        return f"{self._base_url}/{suffix.lstrip('/')}"

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

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
            # Body may echo the request; only the status code is safe to surface.
            raise ProviderError(f"provider returned HTTP {response.status_code}", provider_id=self.config.id)
        try:
            return response.json()
        except ValueError as exc:
            text = response.text.strip()
            if text.startswith("data:"):
                accumulated_text: list[str] = []
                for line in text.splitlines():
                    stripped = line.strip()
                    if stripped.startswith("data: ") and stripped != "data: [DONE]":
                        try:
                            chunk = json.loads(stripped[6:])
                            delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
                            if delta.get("content"):
                                accumulated_text.append(delta["content"])
                        except Exception:
                            continue
                if accumulated_text:
                    return {
                        "choices": [{"message": {"role": "assistant", "content": "".join(accumulated_text)}}],
                        "usage": {},
                    }
            raise ProviderError("provider returned invalid JSON", provider_id=self.config.id) from exc

    def complete(
        self,
        messages: list[ChatMessage],
        opts: CompletionOptions | None = None,
    ) -> CompletionResult:
        opts = opts or CompletionOptions()
        payload: dict = {
            "model": self.config.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": opts.temperature,
            "max_tokens": opts.max_tokens or self.config.max_tokens,
            "stream": False,
        }
        if opts.tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    },
                }
                for tool in opts.tools
            ]

        data = self._post(self._url("chat/completions"), payload)
        try:
            choice = data["choices"][0]
            message = choice.get("message") or {}
            text = message.get("content") or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("provider response missing choices", provider_id=self.config.id) from exc

        tool_calls = [
            ToolCall(
                name=(call.get("function") or {}).get("name", ""),
                arguments=_parse_arguments((call.get("function") or {}).get("arguments")),
            )
            for call in (message.get("tool_calls") or [])
            if (call.get("function") or {}).get("name")
        ]
        usage = data.get("usage") or {}
        return CompletionResult(
            text=text,
            model=data.get("model") or self.config.model,
            provider_id=self.config.id,
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
            tool_calls=tool_calls,
        )

    def embed(self, texts: list[str], opts: dict | None = None) -> EmbeddingResult:
        payload = {"model": self.config.model, "input": list(texts)}
        data = self._post(self._url("embeddings"), payload)
        try:
            vectors = [item["embedding"] for item in data["data"]]
        except (KeyError, TypeError) as exc:
            raise ProviderError("provider response missing embeddings", provider_id=self.config.id) from exc
        if len(vectors) != len(texts):
            raise ProviderError("provider returned wrong number of embeddings", provider_id=self.config.id)
        usage = data.get("usage") or {}
        return EmbeddingResult(
            vectors=[[float(value) for value in vector] for vector in vectors],
            model=data.get("model") or self.config.model,
            provider_id=self.config.id,
            tokens_in=int(usage.get("prompt_tokens") or 0),
        )

    async def stream(
        self,
        messages: list[ChatMessage],
        opts: CompletionOptions | None = None,
    ) -> AsyncIterator[str]:
        opts = opts or CompletionOptions()
        payload: dict = {
            "model": self.config.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": opts.temperature,
            "max_tokens": opts.max_tokens or self.config.max_tokens,
            "stream": True,
        }
        if opts.tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    },
                }
                for tool in opts.tools
            ]

        url = self._url("chat/completions")
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

                saw_done = False
                async for raw_event in aparse_sse_stream(response.aiter_bytes()):
                    remaining_seconds(self.timeout)
                    stripped = raw_event.strip()
                    if not stripped:
                        continue
                    if stripped == "[DONE]":
                        saw_done = True
                        break

                    try:
                        data = json.loads(raw_event)
                    except ValueError as exc:
                        raise ProviderError("malformed SSE event JSON from openai provider", provider_id=self.config.id) from exc

                    if data.get("error"):
                        raise _classify_stream_error(data["error"], provider_id=self.config.id)

                    choices = data.get("choices") or []
                    for choice in choices:
                        finish_reason = choice.get("finish_reason")
                        if finish_reason:
                            fr_str = str(finish_reason).lower().strip()
                            if _is_safety_finish_reason(fr_str):
                                raise ProviderSafetyBlocked("content filter triggered", provider_id=self.config.id)

                        delta = choice.get("delta") or {}
                        content = delta.get("content")
                        if isinstance(content, str) and content:
                            yield content

                if not saw_done:
                    raise ProviderError("stream truncated before [DONE]", provider_id=self.config.id)

        except (httpx.TimeoutException, TimeoutError) as exc:
            raise ProviderTimeout("provider timed out", provider_id=self.config.id) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"transport error: {type(exc).__name__}", provider_id=self.config.id) from exc
        finally:
            if owned_client:
                await client.aclose()


def _parse_arguments(raw: object) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        import json

        try:
            parsed = json.loads(raw)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _is_safety_finish_reason(finish_reason: str) -> bool:
    fr = finish_reason.lower().strip()
    safety_tokens = ("content_filter", "safety", "prohibited", "filter", "blocked", "sensitive", "policy", "violation")
    return any(token in fr for token in safety_tokens)


def _classify_stream_error(err: object, provider_id: str) -> ProviderError:
    """Classify an in-stream error dict/str/code without logging payload/prompt."""
    if isinstance(err, dict):
        code_val = err.get("code")
        type_val = err.get("type")
        msg_val = err.get("message")
        identifiers = [
            str(code_val or "").lower(),
            str(type_val or "").lower(),
            str(msg_val or "").lower(),
        ]
    else:
        err_str = str(err or "").lower()
        identifiers = [err_str]

    safety_keywords = {"content_filter", "safety", "prohibited", "content_management_policy", "filter"}
    for ident in identifiers:
        for kw in safety_keywords:
            if kw in ident:
                return ProviderSafetyBlocked("content filter triggered", provider_id=provider_id)

    quota_keywords = {"429", "rate_limit", "rate_limited", "quota", "insufficient_quota"}
    for ident in identifiers:
        for kw in quota_keywords:
            if kw in ident:
                return ProviderRateLimited("provider rate limited", provider_id=provider_id)

    # Static constant message: never interpolate provider-controlled content
    return ProviderError("provider returned stream error", provider_id=provider_id)
