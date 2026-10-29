"""Gemini provider: `generateContent` + `batchEmbedContents`.

API key travels in the `x-goog-api-key` header (not the query string) so it never
lands in URL logs.
"""

from __future__ import annotations

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

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiProvider(LLMProvider):
    def __init__(self, config: ProviderConfig, client: httpx.Client | None = None) -> None:
        super().__init__(config)
        if not config.api_key:
            raise ProviderInvalidConfig("apiKey is required for gemini", provider_id=config.id)
        self._base_url = validate_base_url(
            config.base_url or DEFAULT_BASE_URL, provider_id=config.id
        ).rstrip("/")
        self._client = client or httpx.Client(timeout=self.timeout)

    def _headers(self) -> dict[str, str]:
        return {"Content-Type": "application/json", "x-goog-api-key": self.config.api_key or ""}

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
        try:
            candidate = data["candidates"][0]
            parts = (candidate.get("content") or {}).get("parts") or []
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
