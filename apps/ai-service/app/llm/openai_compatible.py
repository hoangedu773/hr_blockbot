"""OpenAI-compatible provider: `/chat/completions` + `/embeddings`.

Covers OpenAI, Groq, DeepSeek, OpenRouter, vLLM and Ollama's OpenAI-compatible API.
`baseUrl` must include the API version prefix (e.g. `https://api.openai.com/v1`);
the adapter appends `/chat/completions` and `/embeddings`.
"""

from __future__ import annotations

import json
import logging

import httpx

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
    ProviderTimeout,
    ToolCall,
)
from app.llm.url_guard import validate_base_url

logger = logging.getLogger("ai.llm.openai_compatible")


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, config: ProviderConfig, client: httpx.Client | None = None) -> None:
        super().__init__(config)
        if not config.base_url:
            raise ProviderInvalidConfig("baseUrl is required", provider_id=config.id)
        self._base_url = validate_base_url(config.base_url, provider_id=config.id).rstrip("/")
        self._client = client or httpx.Client(timeout=self.timeout)

    def _url(self, suffix: str) -> str:
        return f"{self._base_url}/{suffix.lstrip('/')}"

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    def _post(self, url: str, payload: dict) -> dict:
        try:
            response = self._client.post(url, json=payload, headers=self._headers(), timeout=self.timeout)
        except httpx.TimeoutException as exc:
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
