"""Provider streaming tests with httpx.MockTransport and AsyncIterator.

Covers:
- Delta arrival before upstream completion (incremental true streaming)
- SSE UTF-8 multi-byte split across frames and arbitrary chunk boundaries
- Terminal success verification (OpenAI [DONE], Gemini finishReason)
- SAFETY / content_filter after partial content emission
- 429 rate limit before first delta
- Network failure before vs after first delta (failover vs propagate)
- Truncated stream EOF detection
- Generator close / cancellation resource cleanup
- Non-user-visible content filtering (thought, reasoning, tool calls)
- ProviderChain failover before first delta vs no failover after first delta
- ProviderChain no failover on SAFETY_BLOCKED even before first delta
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import httpx
import pytest

from app.llm.base import (
    ChatMessage,
    CompletionOptions,
    LLMProvider,
    LLMUnavailable,
    ProviderConfig,
    ProviderError,
    ProviderRateLimited,
    ProviderSafetyBlocked,
    ProviderTimeout,
    aparse_sse_stream,
)
from app.llm.chain import ProviderChain
from app.llm.fake import FakeProvider
from app.llm.gemini import GeminiProvider
from app.llm.openai_compatible import OpenAICompatibleProvider


class AsyncChunkStream(httpx.AsyncByteStream):
    """Deterministic async chunk streamer with close callback and error injection."""

    def __init__(self, chunks: list[bytes | Exception], on_close=None):
        self._chunks = list(chunks)
        self.on_close = on_close
        self.closed = False

    async def __aiter__(self):
        for item in self._chunks:
            if isinstance(item, Exception):
                raise item
            yield item

    async def aclose(self):
        self.closed = True
        if self.on_close:
            self.on_close()


class StepStream(httpx.AsyncByteStream):
    """Incremental streamer that steps through production to verify non-buffered consumption."""

    def __init__(self):
        self.step = 0
        self.closed = False

    async def __aiter__(self):
        self.step = 1
        yield b'data: {"choices":[{"delta":{"content":"token1 "}}]}\n\n'
        self.step = 2
        yield b'data: {"choices":[{"delta":{"content":"token2 "}}]}\n\n'
        self.step = 3
        yield b"data: [DONE]\n\n"

    async def aclose(self):
        self.closed = True


def test_aparse_sse_stream_handles_utf8_split_across_frames():
    async def _run():
        text = "Tiền lương hàng tháng: 10.000.000đ"
        payload = f'data: {{"text": "{text}"}}\n\n'.encode("utf-8")

        # Split the payload right across byte boundaries into 3-byte slices
        slices = [payload[i : i + 3] for i in range(0, len(payload), 3)]

        async def _byte_gen():
            for s in slices:
                yield s

        events = [e async for e in aparse_sse_stream(_byte_gen())]
        assert len(events) == 1
        assert f'"text": "{text}"' in events[0]

    asyncio.run(_run())


def test_aparse_sse_stream_handles_multiline_data_and_comments():
    async def _run():
        raw = (
            b": comment ping\n"
            b"data: line 1\n"
            b"data: line 2\n\n"
            b": another comment\n"
            b"data: line 3\n\n"
        )
        chunks = [raw[:15], raw[15:35], raw[35:]]

        async def _byte_gen():
            for c in chunks:
                yield c

        events = [e async for e in aparse_sse_stream(_byte_gen())]
        assert events == ["line 1\nline 2", "line 3"]
    asyncio.run(_run())


def test_aparse_sse_stream_does_not_dispatch_incomplete_event_at_eof():
    async def _run():
        # Stream abruptly ends with partial data missing empty-line delimiter
        chunks = [b'data: {"choices":[{"delta":{"content":"partial"}}}']

        async def _byte_gen():
            for c in chunks:
                yield c

        events = [e async for e in aparse_sse_stream(_byte_gen())]
        assert events == []

    asyncio.run(_run())

def test_openai_streaming_delta_arrives_before_upstream_finishes():
    async def _run():
        stream = StepStream()

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=stream)

        provider = OpenAICompatibleProvider(
            ProviderConfig(
                id="openai-stream",
                type="openai_compatible",
                model="gpt-test",
                base_url="https://api.openai.com/v1",
                api_key="k",
            ),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        gen = provider.stream([ChatMessage("user", "hi")])
        first = await anext(gen)
        assert first == "token1 "
        assert stream.step < 3  # Upstream has not finished generating

        second = await anext(gen)
        assert second == "token2 "

        with pytest.raises(StopAsyncIteration):
            await anext(gen)
        assert stream.step == 3

    asyncio.run(_run())


def test_openai_streaming_utf8_multi_byte_and_frame_splits():
    async def _run():
        full_event = (
            'data: {"choices":[{"delta":{"content":"Lương "}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"tháng 12"}}]}\n\n'
            'data: [DONE]\n\n'
        ).encode("utf-8")

        # Split right in the middle of UTF-8 byte sequence for 'ư' (\xc6\xb0)
        split_idx = full_event.index(b"\xc6") + 1
        chunk1 = full_event[:split_idx]
        chunk2 = full_event[split_idx : split_idx + 15]
        chunk3 = full_event[split_idx + 15 :]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream([chunk1, chunk2, chunk3]))

        provider = OpenAICompatibleProvider(
            ProviderConfig(
                id="openai-utf8",
                type="openai_compatible",
                model="gpt-test",
                base_url="https://api.openai.com/v1",
                api_key="k",
            ),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        deltas = [d async for d in provider.stream([ChatMessage("user", "hi")])]
        assert "".join(deltas) == "Lương tháng 12"

    asyncio.run(_run())


def test_openai_streaming_filters_thinking_and_tool_calls():
    async def _run():
        chunks = [
            b'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"secret thought"}}]}\n\n',
            b'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"get_kpi"}}]}}]}\n\n',
            b'data: {"choices":[{"delta":{"content":"User visible text."}}]}\n\n',
            b"data: [DONE]\n\n",
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = OpenAICompatibleProvider(
            ProviderConfig(
                id="openai-filter",
                type="openai_compatible",
                model="gpt-test",
                base_url="https://api.openai.com/v1",
                api_key="k",
            ),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        deltas = [d async for d in provider.stream([ChatMessage("user", "hi")])]
        assert deltas == ["User visible text."]

    asyncio.run(_run())


def test_openai_streaming_safety_after_partial_raises_blocked():
    async def _run():
        chunks = [
            'data: {"choices":[{"delta":{"content":"Phần mở đầu an toàn. "}}]}\n\n'.encode("utf-8"),
            'data: {"choices":[{"delta":{"content":"nội dung cấm"},"finish_reason":"content_filter"}]}\n\n'.encode("utf-8"),
            b"data: [DONE]\n\n",
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = OpenAICompatibleProvider(
            ProviderConfig(
                id="openai-safety",
                type="openai_compatible",
                model="gpt-test",
                base_url="https://api.openai.com/v1",
                api_key="k",
            ),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        gen = provider.stream([ChatMessage("user", "hi")])
        first = await anext(gen)
        assert first == "Phần mở đầu an toàn. "

        with pytest.raises(ProviderSafetyBlocked):
            await anext(gen)

    asyncio.run(_run())


def test_openai_streaming_429_before_first_delta():
    async def _run():
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, json={"error": {"code": 429, "message": "rate limited"}})

        provider = OpenAICompatibleProvider(
            ProviderConfig(
                id="openai-429",
                type="openai_compatible",
                model="gpt-test",
                base_url="https://api.openai.com/v1",
                api_key="k",
            ),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        with pytest.raises(ProviderRateLimited):
            _ = [d async for d in provider.stream([ChatMessage("user", "hi")])]

    asyncio.run(_run())


def test_openai_streaming_network_failure_before_first_delta():
    async def _run():
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("Connection failed", request=request)

        provider = OpenAICompatibleProvider(
            ProviderConfig(
                id="openai-net-before",
                type="openai_compatible",
                model="gpt-test",
                base_url="https://api.openai.com/v1",
                api_key="k",
            ),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        with pytest.raises(ProviderError) as excinfo:
            _ = [d async for d in provider.stream([ChatMessage("user", "hi")])]
        assert "ConnectError" in str(excinfo.value)

    asyncio.run(_run())


def test_openai_streaming_network_failure_after_first_delta():
    async def _run():
        stream = AsyncChunkStream([
            b'data: {"choices":[{"delta":{"content":"delta 1"}}]}\n\n',
            httpx.ReadError("TCP reset by peer"),
        ])

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=stream)

        provider = OpenAICompatibleProvider(
            ProviderConfig(
                id="openai-net-after",
                type="openai_compatible",
                model="gpt-test",
                base_url="https://api.openai.com/v1",
                api_key="k",
            ),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        gen = provider.stream([ChatMessage("user", "hi")])
        first = await anext(gen)
        assert first == "delta 1"

        with pytest.raises(ProviderError) as excinfo:
            await anext(gen)
        assert "ReadError" in str(excinfo.value)

    asyncio.run(_run())


def test_openai_streaming_truncated_eof_raises_error():
    async def _run():
        chunks = [
            b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = OpenAICompatibleProvider(
            ProviderConfig(
                id="openai-truncated",
                type="openai_compatible",
                model="gpt-test",
                base_url="https://api.openai.com/v1",
                api_key="k",
            ),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        gen = provider.stream([ChatMessage("user", "hi")])
        first = await anext(gen)
        assert first == "partial"

        with pytest.raises(ProviderError) as excinfo:
            await anext(gen)
        assert "truncated" in str(excinfo.value)

    asyncio.run(_run())


def test_openai_streaming_generator_close_cancels_upstream():
    async def _run():
        stream = AsyncChunkStream([
            b'data: {"choices":[{"delta":{"content":"token1"}}]}\n\n',
            b'data: {"choices":[{"delta":{"content":"token2"}}]}\n\n',
            b"data: [DONE]\n\n",
        ])

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=stream)

        provider = OpenAICompatibleProvider(
            ProviderConfig(
                id="openai-close",
                type="openai_compatible",
                model="gpt-test",
                base_url="https://api.openai.com/v1",
                api_key="k",
            ),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        gen = provider.stream([ChatMessage("user", "hi")])
        first = await anext(gen)
        assert first == "token1"
        assert stream.closed is False

        await gen.aclose()
        assert stream.closed is True

    asyncio.run(_run())


def test_gemini_streaming_terminal_success():
    async def _run():
        chunks = [
            'data: {"candidates":[{"content":{"parts":[{"text":"Chào "}],"role":"model"}}]}\n\n'.encode("utf-8"),
            'data: {"candidates":[{"content":{"parts":[{"text":"bạn!"}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3}}\n\n'.encode("utf-8"),
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path.endswith(":streamGenerateContent")
            assert "alt=sse" in request.url.query.decode()
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = GeminiProvider(
            ProviderConfig(id="gemini-stream", type="gemini", model="gemini-test", api_key="k"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        deltas = [d async for d in provider.stream([ChatMessage("user", "hi")])]
        assert "".join(deltas) == "Chào bạn!"

    asyncio.run(_run())


def test_gemini_streaming_filters_thought_and_function_call():
    async def _run():
        chunks = [
            'data: {"candidates":[{"content":{"parts":[{"text":"suy nghĩ ngầm","thought":true},{"functionCall":{"name":"call_tool","args":{}}}],"role":"model"}}]}\n\n'.encode("utf-8"),
            'data: {"candidates":[{"content":{"parts":[{"text":"Văn bản hiển thị."}],"role":"model"},"finishReason":"STOP"}]}\n\n'.encode("utf-8"),
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = GeminiProvider(
            ProviderConfig(id="gemini-filter", type="gemini", model="gemini-test", api_key="k"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        deltas = [d async for d in provider.stream([ChatMessage("user", "hi")])]
        assert deltas == ["Văn bản hiển thị."]

    asyncio.run(_run())


def test_gemini_streaming_safety_after_partial_raises_blocked():
    async def _run():
        chunks = [
            'data: {"candidates":[{"content":{"parts":[{"text":"Một phần câu trả lời. "}],"role":"model"}}]}\n\n'.encode("utf-8"),
            b'data: {"candidates":[{"finishReason":"SAFETY"}]}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = GeminiProvider(
            ProviderConfig(id="gemini-safety", type="gemini", model="gemini-test", api_key="k"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        gen = provider.stream([ChatMessage("user", "hi")])
        first = await anext(gen)
        assert first == "Một phần câu trả lời. "

        with pytest.raises(ProviderSafetyBlocked):
            await anext(gen)

    asyncio.run(_run())


def test_gemini_streaming_image_safety_after_partial_raises_blocked():
    async def _run():
        chunks = [
            'data: {"candidates":[{"content":{"parts":[{"text":"Mô tả an toàn ban đầu. "}],"role":"model"}}]}\n\n'.encode("utf-8"),
            b'data: {"candidates":[{"finishReason":"IMAGE_SAFETY"}]}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = GeminiProvider(
            ProviderConfig(id="gemini-img-safety", type="gemini", model="gemini-test", api_key="k"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        gen = provider.stream([ChatMessage("user", "hi")])
        first = await anext(gen)
        assert first == "Mô tả an toàn ban đầu. "

        with pytest.raises(ProviderSafetyBlocked) as excinfo:
            await anext(gen)
        assert str(excinfo.value) == "gemini safety filter triggered"

    asyncio.run(_run())


def test_gemini_streaming_image_safety_before_first_delta_no_failover():
    async def _run():
        secondary_called = False
        chunks = [
            b'data: {"candidates":[{"finishReason":"IMAGE_SAFETY"}]}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        p1 = GeminiProvider(
            ProviderConfig(id="gemini-img-p1", type="gemini", model="gemini-test", api_key="k", priority=1),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        class _SecondaryProvider(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal secondary_called
                secondary_called = True
                yield "failover output"

        p2 = _SecondaryProvider(
            ProviderConfig(id="p2", type="fake", model="m2", priority=2)
        )

        chain = ProviderChain([p1, p2])
        with pytest.raises(ProviderSafetyBlocked) as excinfo:
            _ = [d async for d in chain.stream([ChatMessage("user", "generate image")])]

        assert str(excinfo.value) == "gemini safety filter triggered"
        assert secondary_called is False

    asyncio.run(_run())


def test_gemini_streaming_image_safety_after_partial_no_failover_and_no_completed():
    async def _run():
        secondary_called = False
        chunks = [
            'data: {"candidates":[{"content":{"parts":[{"text":"Bắt đầu render... "}],"role":"model"}}]}\n\n'.encode("utf-8"),
            b'data: {"candidates":[{"finishReason":"IMAGE_SAFETY"}]}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        p1 = GeminiProvider(
            ProviderConfig(id="gemini-img-p1", type="gemini", model="gemini-test", api_key="k", priority=1),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        class _SecondaryProvider(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal secondary_called
                secondary_called = True
                yield "failover output"

        p2 = _SecondaryProvider(
            ProviderConfig(id="p2", type="fake", model="m2", priority=2)
        )

        chain = ProviderChain([p1, p2])
        gen = chain.stream([ChatMessage("user", "test")])
        first = await anext(gen)
        assert first == "Bắt đầu render... "

        with pytest.raises(ProviderSafetyBlocked) as excinfo:
            await anext(gen)

        assert str(excinfo.value) == "gemini safety filter triggered"
        assert secondary_called is False

    asyncio.run(_run())


def test_gemini_streaming_finish_reason_sentinel_never_leaked_in_exception(caplog):
    async def _run():
        sentinel = "SECRET_CREDENTIAL_SENTINEL_XYZ987"

        # 1. Unknown / non-terminal finishReason containing sentinel must not be echoed
        chunks1 = [f'data: {{"candidates":[{{"finishReason":"UNKNOWN_FINISH_REASON_{sentinel}"}}]}}\n\n'.encode("utf-8")]
        provider1 = GeminiProvider(
            ProviderConfig(id="p1", type="gemini", model="gemini-test", api_key="k"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, stream=AsyncChunkStream(chunks1)))),
        )
        with pytest.raises(ProviderError) as excinfo1:
            _ = [d async for d in provider1.stream([ChatMessage("user", "test")])]
        assert sentinel not in str(excinfo1.value)
        assert sentinel not in caplog.text

        # 2. Safety finishReason containing sentinel must raise ProviderSafetyBlocked without echoing sentinel
        chunks2 = [f'data: {{"candidates":[{{"finishReason":"SAFETY_{sentinel}"}}]}}\n\n'.encode("utf-8")]
        provider2 = GeminiProvider(
            ProviderConfig(id="p2", type="gemini", model="gemini-test", api_key="k"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, stream=AsyncChunkStream(chunks2)))),
        )
        with pytest.raises(ProviderSafetyBlocked) as excinfo2:
            _ = [d async for d in provider2.stream([ChatMessage("user", "test")])]
        assert sentinel not in str(excinfo2.value)
        assert sentinel not in caplog.text

    asyncio.run(_run())


def test_gemini_streaming_prompt_blocked_safety():
    async def _run():
        chunks = [
            b'data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = GeminiProvider(
            ProviderConfig(id="gemini-prompt-block", type="gemini", model="gemini-test", api_key="k"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        with pytest.raises(ProviderSafetyBlocked):
            _ = [d async for d in provider.stream([ChatMessage("user", "hi")])]

    asyncio.run(_run())


def test_gemini_streaming_truncated_stream_raises_error():
    async def _run():
        chunks = [
            b'data: {"candidates":[{"content":{"parts":[{"text":"partial"}],"role":"model"}}]}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = GeminiProvider(
            ProviderConfig(id="gemini-truncated", type="gemini", model="gemini-test", api_key="k"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        gen = provider.stream([ChatMessage("user", "hi")])
        first = await anext(gen)
        assert first == "partial"

        with pytest.raises(ProviderError) as excinfo:
            await anext(gen)
        assert "truncated" in str(excinfo.value)

    asyncio.run(_run())


def test_gemini_streaming_generator_close_cancels_upstream():
    async def _run():
        stream = AsyncChunkStream([
            b'data: {"candidates":[{"content":{"parts":[{"text":"c1"}],"role":"model"}}]}\n\n',
            b'data: {"candidates":[{"content":{"parts":[{"text":"c2"}],"role":"model"},"finishReason":"STOP"}]}\n\n',
        ])

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=stream)

        provider = GeminiProvider(
            ProviderConfig(id="gemini-close", type="gemini", model="gemini-test", api_key="k"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )

        gen = provider.stream([ChatMessage("user", "hi")])
        first = await anext(gen)
        assert first == "c1"
        assert stream.closed is False

        await gen.aclose()
        assert stream.closed is True

    asyncio.run(_run())


def test_fake_provider_streaming_deterministic_chunks():
    async def _run():
        provider = FakeProvider(scripted=[["Xin ", "chào ", "Guta!"]])
        deltas = [d async for d in provider.stream([ChatMessage("user", "hi")])]
        assert deltas == ["Xin ", "chào ", "Guta!"]

    asyncio.run(_run())


def test_provider_chain_stream_failover_before_first_delta():
    async def _run():
        class _FailingProvider(OpenAICompatibleProvider):
            async def stream(self, messages, opts=None):
                raise ProviderRateLimited("rate limit hit", provider_id=self.config.id)
                if False:
                    yield ""

        failing = _FailingProvider(
            ProviderConfig(id="fail-p1", type="openai_compatible", model="m", base_url="https://api.example.com/v1", priority=1)
        )
        fallback = FakeProvider(
            ProviderConfig(id="fake-p2", type="fake", model="m", priority=2),
            scripted=[["Nội dung ", "từ fallback"]]
        )

        chain = ProviderChain([failing, fallback])
        deltas = [d async for d in chain.stream([ChatMessage("user", "test")])]
        assert "".join(deltas) == "Nội dung từ fallback"

    asyncio.run(_run())


def test_provider_chain_stream_no_failover_after_first_delta():
    async def _run():
        secondary_called = False

        class _PartialFailingProvider(OpenAICompatibleProvider):
            async def stream(self, messages, opts=None):
                yield "Đoạn 1 đã phát. "
                raise ProviderSafetyBlocked("safety filter triggered on chunk 2", provider_id=self.config.id)

        class _SecondaryProvider(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal secondary_called
                secondary_called = True
                yield "Không được phát"

        primary = _PartialFailingProvider(
            ProviderConfig(id="primary", type="openai_compatible", model="m", base_url="https://api.example.com/v1", priority=1)
        )
        secondary = _SecondaryProvider(
            ProviderConfig(id="secondary", type="fake", model="m", priority=2)
        )

        chain = ProviderChain([primary, secondary])
        gen = chain.stream([ChatMessage("user", "test")])

        first = await anext(gen)
        assert first == "Đoạn 1 đã phát. "

        with pytest.raises(ProviderSafetyBlocked):
            await anext(gen)

        assert secondary_called is False

    asyncio.run(_run())


def test_provider_chain_stream_no_failover_on_safety_before_first_delta():
    async def _run():
        secondary_called = False

        class _SafetyBlockedProvider(OpenAICompatibleProvider):
            async def stream(self, messages, opts=None):
                raise ProviderSafetyBlocked("prompt contains prohibited content", provider_id=self.config.id)
                if False:
                    yield ""

        class _SecondaryProvider(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal secondary_called
                secondary_called = True
                yield "Không được phép chạy"

        primary = _SafetyBlockedProvider(
            ProviderConfig(id="primary", type="openai_compatible", model="m", base_url="https://api.example.com/v1", priority=1)
        )
        secondary = _SecondaryProvider(
            ProviderConfig(id="secondary", type="fake", model="m", priority=2)
        )

        chain = ProviderChain([primary, secondary])
        with pytest.raises(ProviderSafetyBlocked):
            _ = [d async for d in chain.stream([ChatMessage("user", "prompt doc hai")])]

        assert secondary_called is False

    asyncio.run(_run())


def test_existing_subclass_without_stream_fails_closed():
    async def _run():
        class _LegacyTestProvider(LLMProvider):
            def complete(self, messages, opts=None):
                raise NotImplementedError

            def embed(self, texts, opts=None):
                raise NotImplementedError

        legacy = _LegacyTestProvider(ProviderConfig(id="legacy", type="fake", model="m"))
        with pytest.raises(ProviderError) as excinfo:
            _ = [d async for d in legacy.stream([ChatMessage("user", "test")])]
        assert "not supported" in str(excinfo.value)

    asyncio.run(_run())


def test_openai_streaming_error_dict_content_filter_before_first_chunk():
    async def _run():
        chunks = [
            b'data: {"error":{"code":"content_filter","message":"The prompt triggered content management policy"}}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = OpenAICompatibleProvider(
            ProviderConfig(id="openai-err-safety", type="openai_compatible", model="m", base_url="https://api.openai.com/v1", priority=1),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
        fallback_called = False

        class _FallbackProvider(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal fallback_called
                fallback_called = True
                yield "Bypass"

        fallback = _FallbackProvider(ProviderConfig(id="fallback", type="fake", model="m", priority=2))
        chain = ProviderChain([provider, fallback])

        with pytest.raises(ProviderSafetyBlocked):
            _ = [d async for d in chain.stream([ChatMessage("user", "test")])]

        assert fallback_called is False

    asyncio.run(_run())


def test_openai_streaming_error_string_content_filter_after_first_chunk():
    async def _run():
        chunks = [
            b'data: {"choices":[{"delta":{"content":"part 1 "}}]}\n\n',
            b'data: {"error":"content_filter"}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = OpenAICompatibleProvider(
            ProviderConfig(id="openai-err-safety2", type="openai_compatible", model="m", base_url="https://api.openai.com/v1", priority=1),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
        fallback_called = False

        class _FallbackProvider(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal fallback_called
                fallback_called = True
                yield "Bypass"

        fallback = _FallbackProvider(ProviderConfig(id="fallback", type="fake", model="m", priority=2))
        chain = ProviderChain([provider, fallback])

        gen = chain.stream([ChatMessage("user", "test")])
        first = await anext(gen)
        assert first == "part 1 "

        with pytest.raises(ProviderSafetyBlocked):
            await anext(gen)

        assert fallback_called is False

    asyncio.run(_run())


def test_openai_streaming_error_string_generic_before_first_chunk():
    async def _run():
        chunks = [
            b'data: {"error":"internal_server_error"}\n\n',
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=AsyncChunkStream(chunks))

        provider = OpenAICompatibleProvider(
            ProviderConfig(id="openai-err-generic", type="openai_compatible", model="m", base_url="https://api.example.com/v1", priority=1),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
        fallback = FakeProvider(
            ProviderConfig(id="fallback", type="fake", model="m", priority=2),
            scripted=[["fallback text"]],
        )
        chain = ProviderChain([provider, fallback])

        deltas = [d async for d in chain.stream([ChatMessage("user", "test")])]
        assert "".join(deltas) == "fallback text"

    asyncio.run(_run())


def test_provider_chain_stream_allows_full_global_deadline_after_first_delta(monkeypatch):
    async def _run():
        current_time = 100.0

        def fake_monotonic():
            return current_time

        import app.llm.chain as chain_mod
        import app.deadline as deadline_mod

        monkeypatch.setattr(chain_mod.time, "monotonic", fake_monotonic)
        monkeypatch.setattr(deadline_mod.time, "monotonic", fake_monotonic)

        class _LongStreamingProvider(LLMProvider):
            def complete(self, messages, opts=None):
                raise AssertionError("unexpected complete call")

            def embed(self, texts, opts=None):
                raise AssertionError("unexpected embed call")

            async def stream(self, messages, opts=None):
                nonlocal current_time
                current_time = 101.0
                yield "chunk 1 "
                current_time = 109.0
                yield "chunk 2"

        secondary_called = False

        class _SecondaryProvider(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal secondary_called
                secondary_called = True
                yield "should not be called"

        p1 = _LongStreamingProvider(
            ProviderConfig(id="p1", type="openai_compatible", model="m1", base_url="https://api1.com", priority=1, timeout_ms=30000)
        )
        p2 = _SecondaryProvider(
            ProviderConfig(id="p2", type="fake", model="m2", priority=2)
        )

        chain = ProviderChain([p1, p2])
        deltas = [d async for d in chain.stream([ChatMessage("user", "test")])]
        assert "".join(deltas) == "chunk 1 chunk 2"
        assert secondary_called is False

    asyncio.run(_run())


def test_openai_streaming_error_sentinel_never_leaked_in_exception(caplog):
    async def _run():
        sentinel = "SECRET_CREDENTIAL_SENTINEL_XYZ987"

        # 1. Error string containing sentinel
        chunks1 = [f'data: {{"error":"internal_failure_with_{sentinel}"}}\n\n'.encode("utf-8")]
        provider1 = OpenAICompatibleProvider(
            ProviderConfig(id="p1", type="openai_compatible", model="m", base_url="https://api.example.com/v1"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, stream=AsyncChunkStream(chunks1)))),
        )
        with pytest.raises(ProviderError) as excinfo1:
            _ = [d async for d in provider1.stream([ChatMessage("user", "test")])]
        assert sentinel not in str(excinfo1.value)
        assert sentinel not in caplog.text

        # 2. Error dict containing sentinel in code/message
        chunks2 = [f'data: {{"error":{{"code":"{sentinel}","message":"leaked {sentinel}"}}}}\n\n'.encode("utf-8")]
        provider2 = OpenAICompatibleProvider(
            ProviderConfig(id="p2", type="openai_compatible", model="m", base_url="https://api.example.com/v1"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, stream=AsyncChunkStream(chunks2)))),
        )
        with pytest.raises(ProviderError) as excinfo2:
            _ = [d async for d in provider2.stream([ChatMessage("user", "test")])]
        assert sentinel not in str(excinfo2.value)

        # 3. Content filter error still properly recognized as safety without leaking sentinel
        chunks3 = [f'data: {{"error":{{"code":"content_filter","message":"blocked_{sentinel}"}}}}\n\n'.encode("utf-8")]
        provider3 = OpenAICompatibleProvider(
            ProviderConfig(id="p3", type="openai_compatible", model="m", base_url="https://api.example.com/v1"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, stream=AsyncChunkStream(chunks3)))),
        )
        with pytest.raises(ProviderSafetyBlocked) as excinfo3:
            _ = [d async for d in provider3.stream([ChatMessage("user", "test")])]
        assert sentinel not in str(excinfo3.value)

        # 4. Quota error still properly recognized without leaking sentinel
        chunks4 = [f'data: {{"error":{{"code":"insufficient_quota","message":"quota_{sentinel}"}}}}\n\n'.encode("utf-8")]
        provider4 = OpenAICompatibleProvider(
            ProviderConfig(id="p4", type="openai_compatible", model="m", base_url="https://api.example.com/v1"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, stream=AsyncChunkStream(chunks4)))),
        )
        with pytest.raises(ProviderRateLimited) as excinfo4:
            _ = [d async for d in provider4.stream([ChatMessage("user", "test")])]
        assert sentinel not in str(excinfo4.value)

    asyncio.run(_run())


def test_provider_chain_stream_httpx_allows_full_global_deadline_after_first_delta(monkeypatch):
    async def _run():
        current_time = 100.0

        def fake_monotonic():
            return current_time

        import app.llm.chain as chain_mod
        import app.deadline as deadline_mod

        monkeypatch.setattr(chain_mod.time, "monotonic", fake_monotonic)
        monkeypatch.setattr(deadline_mod.time, "monotonic", fake_monotonic)

        class _TimeAdvancingByteStream(httpx.AsyncByteStream):
            async def __aiter__(self):
                nonlocal current_time
                current_time = 101.0
                yield b'data: {"choices":[{"delta":{"content":"token1 "}}]}\n\n'
                # Time advances past 107.5 group deadline to 109.0
                current_time = 109.0
                yield b'data: {"choices":[{"delta":{"content":"token2"}}]}\n\n'
                yield b"data: [DONE]\n\n"

            async def aclose(self):
                pass

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, stream=_TimeAdvancingByteStream())

        p1 = OpenAICompatibleProvider(
            ProviderConfig(id="p1", type="openai_compatible", model="m1", base_url="https://api1.com/v1", priority=1, timeout_ms=30000),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
        p2 = FakeProvider(ProviderConfig(id="p2", type="fake", model="m2", priority=2))

        chain = ProviderChain([p1, p2])
        deltas = [d async for d in chain.stream([ChatMessage("user", "test")])]
        assert "".join(deltas) == "token1 token2"

    asyncio.run(_run())


def test_provider_chain_stream_empty_response_before_first_delta_fails_over():
    async def _run():
        class _EmptyStreamProvider(OpenAICompatibleProvider):
            async def stream(self, messages, opts=None):
                if False:
                    yield ""
                # Returns immediately without yielding any deltas

        empty_provider = _EmptyStreamProvider(
            ProviderConfig(id="empty", type="openai_compatible", model="m1", base_url="https://api.example.com/v1", priority=1)
        )
        fallback = FakeProvider(
            ProviderConfig(id="fallback", type="fake", model="m2", priority=2),
            scripted=[["fallback answer"]],
        )

        chain = ProviderChain([empty_provider, fallback])
        deltas = [d async for d in chain.stream([ChatMessage("user", "test")])]
        assert "".join(deltas) == "fallback answer"

    asyncio.run(_run())


def test_openai_streaming_safety_finish_reason_variants():
    async def _run():
        for variant in ("safety_violation", "prohibited", "policy_filter", "sensitive"):
            chunks = [
                'data: {"choices":[{"delta":{"content":"ok "}}]}\n\n'.encode("utf-8"),
                f'data: {{"choices":[{{"delta":{{"content":"bad"}},"finish_reason":"{variant}"}}]}}\n\n'.encode("utf-8"),
                b"data: [DONE]\n\n",
            ]
            provider = OpenAICompatibleProvider(
                ProviderConfig(id="p-variant", type="openai_compatible", model="m", base_url="https://api.openai.com/v1"),
                async_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req, c=chunks: httpx.Response(200, stream=AsyncChunkStream(c)))),
            )
            gen = provider.stream([ChatMessage("user", "test")])
            first = await anext(gen)
            assert first == "ok "
            with pytest.raises(ProviderSafetyBlocked):
                await anext(gen)

    asyncio.run(_run())


def test_openai_streaming_empty_sse_data_frame_ignored():
    async def _run():
        chunks = [
            b"data: \n\n",
            b"data:\n\n",
            b'data: {"choices":[{"delta":{"content":"valid"}}]}\n\n',
            b"data: [DONE]\n\n",
        ]
        provider = OpenAICompatibleProvider(
            ProviderConfig(id="p-empty-sse", type="openai_compatible", model="m", base_url="https://api.openai.com/v1"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, stream=AsyncChunkStream(chunks)))),
        )
        deltas = [d async for d in provider.stream([ChatMessage("user", "test")])]
        assert deltas == ["valid"]

    asyncio.run(_run())


def test_aparse_sse_stream_oversized_single_line_fails_closed():
    async def _run():
        # Single line exceeding DEFAULT_MAX_LINE_SIZE (64 KiB)
        oversized_line = b"data: " + (b"A" * 70000) + b"\n\n"

        async def _gen():
            yield oversized_line

        with pytest.raises(ProviderError) as excinfo:
            _ = [e async for e in aparse_sse_stream(_gen())]
        assert "SSE line buffer exceeded limit" in str(excinfo.value)

    asyncio.run(_run())


def test_aparse_sse_stream_256kib_incomplete_frame_fails_closed():
    async def _run():
        # Exact reproduction: 256 KiB input without delimiter must be rejected (fail closed)
        raw_payload = b"X" * (256 * 1024)

        async def _gen():
            # Delivered in two 128 KiB network chunks without newlines
            yield raw_payload[: 128 * 1024]
            yield raw_payload[128 * 1024 :]

        with pytest.raises(ProviderError) as excinfo:
            _ = [e async for e in aparse_sse_stream(_gen())]
        assert "SSE line buffer exceeded limit" in str(excinfo.value)

    asyncio.run(_run())


def test_aparse_sse_stream_oversized_multiline_event_fails_closed():
    async def _run():
        # Multiple lines each under line limit, but total event payload exceeds DEFAULT_MAX_EVENT_SIZE (128 KiB)
        # without an empty-line delimiter
        line_data = b"data: " + (b"m" * 1000) + b"\n"
        total_lines = 140  # 140,000 bytes > 131,072 bytes

        async def _gen():
            for _ in range(total_lines):
                yield line_data

        with pytest.raises(ProviderError) as excinfo:
            _ = [e async for e in aparse_sse_stream(_gen())]
        assert "SSE event buffer exceeded limit" in str(excinfo.value)

    asyncio.run(_run())


def test_aparse_sse_stream_multiple_small_frames_single_chunk_valid():
    async def _run():
        # Single network chunk containing 50 small valid frames must all be parsed without false rejection
        frames = [f'data: {{"id":{i}}}\n\n'.encode("utf-8") for i in range(50)]
        single_chunk = b"".join(frames)

        async def _gen():
            yield single_chunk

        events = [e async for e in aparse_sse_stream(_gen())]
        assert len(events) == 50
        assert events[0] == '{"id":0}'
        assert events[49] == '{"id":49}'

    asyncio.run(_run())


def test_openai_streaming_utf8_split_and_generator_cancel():
    async def _run():
        # Multi-byte UTF-8 string split across arbitrary byte boundaries + client cancellation
        text = "Tiền thưởng và phụ cấp ca đêm: 1.500.000₫"
        payload = (
            f'data: {{"choices":[{{"delta":{{"content":"{text}"}}}}]}}\n\n'
            'data: {"choices":[{"delta":{"content":" (đã duyệt)"}}]}\n\n'
            'data: [DONE]\n\n'
        ).encode("utf-8")

        # Split into 2-byte slices to test heavy fragmentation
        slices = [payload[i : i + 2] for i in range(0, len(payload), 2)]
        stream = AsyncChunkStream(slices)

        provider = OpenAICompatibleProvider(
            ProviderConfig(id="p-utf8-cancel", type="openai_compatible", model="m", base_url="https://api.openai.com/v1"),
            async_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, stream=stream))),
        )

        gen = provider.stream([ChatMessage("user", "test")])
        first_delta = await anext(gen)
        assert first_delta == text
        # Client disconnects / closes generator mid-stream
        await gen.aclose()
        assert stream.closed is True

    asyncio.run(_run())


def test_provider_chain_stream_no_fallback_after_partial_emission_error():
    async def _run():
        # Primary emits 1 token then fails: secondary MUST NOT be invoked
        secondary_called = False

        class _PrimaryWithPartialThenFail(FakeProvider):
            async def stream(self, messages, opts=None):
                yield "token 1"
                raise ProviderError("connection dropped mid-stream", provider_id=self.name)

        class _Secondary(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal secondary_called
                secondary_called = True
                yield "fallback"

        chain = ProviderChain([
            _PrimaryWithPartialThenFail(ProviderConfig(id="primary", type="openai_compatible", model="m1", priority=1)),
            _Secondary(ProviderConfig(id="secondary", type="fake", model="m2", priority=2)),
        ])

        gen = chain.stream([ChatMessage("user", "test")])
        delta1 = await anext(gen)
        assert delta1 == "token 1"

        with pytest.raises(ProviderError) as excinfo:
            await anext(gen)

        assert "connection dropped mid-stream" in str(excinfo.value)
        assert secondary_called is False

    asyncio.run(_run())


def test_provider_chain_stream_times_out_when_provider_hangs_between_chunks():
    async def _run():
        secondary_called = False

        class _HangsBetweenChunks(LLMProvider):
            def complete(self, messages, opts=None):
                raise AssertionError("unexpected complete")

            def embed(self, texts, opts=None):
                raise AssertionError("unexpected embed")

            async def stream(self, messages, opts=None):
                yield "first delta"
                # Provider hangs indefinitely on chunk 2
                await asyncio.sleep(10.0)
                yield "second delta"

        class _Secondary(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal secondary_called
                secondary_called = True
                yield "should not be called"

        # Set provider timeout to 50ms (LLMProvider enforces min 0.1s cap)
        p1 = _HangsBetweenChunks(
            ProviderConfig(id="hanging-p1", type="openai_compatible", model="m1", priority=1, timeout_ms=50)
        )
        p2 = _Secondary(
            ProviderConfig(id="secondary", type="fake", model="m2", priority=2)
        )
        chain = ProviderChain([p1, p2])

        gen = chain.stream([ChatMessage("user", "test")])
        first = await anext(gen)
        assert first == "first delta"

        with pytest.raises(ProviderTimeout) as excinfo:
            await anext(gen)
        assert excinfo.value.code == "LLM_TIMEOUT"
        assert excinfo.value.provider_id == "hanging-p1"
        assert secondary_called is False

    asyncio.run(_run())


def test_provider_chain_stream_cleanup_failure_fails_closed(caplog):
    async def _run():
        class _CleanupFailsStream:
            def __init__(self):
                self.items = ["delta 1", "delta 2"]

            def __aiter__(self):
                return self

            async def __anext__(self):
                if not self.items:
                    raise StopAsyncIteration
                return self.items.pop(0)

            async def aclose(self):
                raise RuntimeError("upstream socket failed to close")

        class _CleanupFailsProvider(LLMProvider):
            def complete(self, messages, opts=None):
                raise AssertionError("unexpected complete")

            def embed(self, texts, opts=None):
                raise AssertionError("unexpected embed")

            def stream(self, messages, opts=None):
                return _CleanupFailsStream()

        p = _CleanupFailsProvider(ProviderConfig(id="p-cleanup-fail", type="openai_compatible", model="m", priority=1))
        chain = ProviderChain([p])

        gen = chain.stream([ChatMessage("user", "hi")])
        delta1 = await anext(gen)
        assert delta1 == "delta 1"
        delta2 = await anext(gen)
        assert delta2 == "delta 2"

        # Stream completes all tokens, but cleanup in finally raises RuntimeError
        with pytest.raises(ProviderError) as excinfo:
            await anext(gen)
        assert "failed to close provider stream" in str(excinfo.value)
        assert excinfo.value.provider_id == "p-cleanup-fail"
        # No tokens or prompts leaked in logs
        assert "delta 1" not in caplog.text
        assert "delta 2" not in caplog.text
        assert "RuntimeError" in caplog.text

    asyncio.run(_run())


def test_provider_chain_stream_cleanup_preserves_safety_blocked(caplog):
    async def _run():
        class _SafetyThenCleanupFailsStream:
            def __init__(self):
                self.count = 0

            def __aiter__(self):
                return self

            async def __anext__(self):
                if self.count == 0:
                    self.count += 1
                    return "safe intro"
                raise ProviderSafetyBlocked("content filter", provider_id="p-safety")

            async def aclose(self):
                raise RuntimeError("upstream socket close error")

        class _Provider(LLMProvider):
            def complete(self, messages, opts=None):
                raise AssertionError("unexpected complete")

            def embed(self, texts, opts=None):
                raise AssertionError("unexpected embed")

            def stream(self, messages, opts=None):
                return _SafetyThenCleanupFailsStream()

        chain = ProviderChain([_Provider(ProviderConfig(id="p-safety", type="openai_compatible", model="m", priority=1))])
        gen = chain.stream([ChatMessage("user", "test")])
        assert await anext(gen) == "safe intro"

        with pytest.raises(ProviderSafetyBlocked):
            await anext(gen)

        assert "cleanup_failed" in caplog.text

    asyncio.run(_run())


def test_provider_chain_stream_cleanup_failure_before_first_chunk_aborts_failover():
    async def _run():
        secondary_called = False

        class _FailCloseStream:
            def __aiter__(self):
                return self

            async def __anext__(self):
                raise StopAsyncIteration

            async def aclose(self):
                raise RuntimeError("upstream socket close error")

        class _P1(LLMProvider):
            def complete(self, messages, opts=None):
                raise AssertionError("unexpected complete")

            def embed(self, texts, opts=None):
                raise AssertionError("unexpected embed")

            def stream(self, messages, opts=None):
                return _FailCloseStream()

        class _P2(FakeProvider):
            async def stream(self, messages, opts=None):
                nonlocal secondary_called
                secondary_called = True
                yield "fallback"

        chain = ProviderChain([
            _P1(ProviderConfig(id="p1", type="openai_compatible", model="m1", priority=1)),
            _P2(ProviderConfig(id="p2", type="fake", model="m2", priority=2)),
        ])

        with pytest.raises(ProviderError) as excinfo:
            async for _ in chain.stream([ChatMessage("user", "test")]):
                pass

        assert "failed to close provider stream" in str(excinfo.value)
        assert secondary_called is False

    asyncio.run(_run())


def test_provider_chain_stream_cleanup_does_not_mask_cancellation():
    async def _run():
        class _CancelStream:
            def __aiter__(self):
                return self

            async def __anext__(self):
                return "delta 1"

            async def aclose(self):
                pass

        class _P(LLMProvider):
            def complete(self, messages, opts=None):
                raise AssertionError("unexpected complete")

            def embed(self, texts, opts=None):
                raise AssertionError("unexpected embed")

            def stream(self, messages, opts=None):
                return _CancelStream()

        chain = ProviderChain([_P(ProviderConfig(id="p-cancel", type="openai_compatible", model="m", priority=1))])
        gen = chain.stream([ChatMessage("user", "test")])
        delta = await anext(gen)
        assert delta == "delta 1"

        # Explicit client cancellation via aclose
        await gen.aclose()

    asyncio.run(_run())
