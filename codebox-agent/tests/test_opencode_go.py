"""Tests for the OpenCode Go provider shim.

Focuses on the pure rewrite helpers, the SSE-buffering stream wrappers, and
the httpx-level transports. A light-weight smoke test exercises the
``ChatOpenCodeGo`` wiring without hitting the network.
"""

from __future__ import annotations

import asyncio
import json
from typing import TYPE_CHECKING

import httpx
import pytest

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Iterator

from codebox_agent.opencode_go import (
    OPENCODE_GO_BASE_URL,
    ChatOpenCodeGo,
    ReasoningNormalizingAsyncTransport,
    ReasoningNormalizingTransport,
    _normalize_reasoning,
    _rewrite_chat_json,
    _rewrite_sse_event,
    _SSERewritingAsyncStream,
    _SSERewritingSyncStream,
)

# ---------------------------------------------------------------------------
# _normalize_reasoning
# ---------------------------------------------------------------------------


class TestNormalizeReasoning:
    def test_copies_reasoning_content_when_reasoning_absent(self):
        obj = {"reasoning_content": "thinking..."}
        assert _normalize_reasoning(obj) is True
        assert obj["reasoning"] == "thinking..."

    def test_preserves_existing_reasoning(self):
        obj = {"reasoning": "already here", "reasoning_content": "other"}
        assert _normalize_reasoning(obj) is False
        assert obj["reasoning"] == "already here"

    def test_empty_reasoning_content_is_ignored(self):
        obj = {"reasoning_content": ""}
        assert _normalize_reasoning(obj) is False
        assert "reasoning" not in obj

    def test_none_reasoning_content_is_ignored(self):
        obj = {"reasoning_content": None}
        assert _normalize_reasoning(obj) is False

    def test_empty_existing_reasoning_is_replaced(self):
        obj = {"reasoning": "", "reasoning_content": "think"}
        assert _normalize_reasoning(obj) is True
        assert obj["reasoning"] == "think"

    def test_non_dict_returns_false(self):
        assert _normalize_reasoning(None) is False
        assert _normalize_reasoning("string") is False
        assert _normalize_reasoning(42) is False


# ---------------------------------------------------------------------------
# _rewrite_chat_json
# ---------------------------------------------------------------------------


def _chat_json(**choice_override) -> bytes:
    payload = {
        "id": "x",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "", **choice_override},
                "finish_reason": "stop",
            }
        ],
    }
    return json.dumps(payload).encode("utf-8")


class TestRewriteChatJSON:
    def test_copies_reasoning_content_in_message(self):
        body = _chat_json(reasoning_content="hmm")
        out = _rewrite_chat_json(body)
        payload = json.loads(out)
        msg = payload["choices"][0]["message"]
        assert msg["reasoning"] == "hmm"
        assert msg["reasoning_content"] == "hmm"

    def test_preserves_existing_reasoning(self):
        body = _chat_json(reasoning="kept", reasoning_content="ignored")
        out = _rewrite_chat_json(body)
        assert json.loads(out)["choices"][0]["message"]["reasoning"] == "kept"

    def test_no_reasoning_content_passthrough(self):
        body = _chat_json()
        assert _rewrite_chat_json(body) == body

    def test_malformed_json_passthrough(self):
        body = b"not { valid json"
        assert _rewrite_chat_json(body) == body

    def test_empty_body_passthrough(self):
        assert _rewrite_chat_json(b"") == b""

    def test_missing_choices_passthrough(self):
        body = b'{"id": "x"}'
        assert _rewrite_chat_json(body) == body

    def test_non_dict_root_passthrough(self):
        body = b"[1, 2, 3]"
        assert _rewrite_chat_json(body) == body


# ---------------------------------------------------------------------------
# _rewrite_sse_event
# ---------------------------------------------------------------------------


def _sse_data(obj: dict) -> bytes:
    return b"data: " + json.dumps(obj).encode("utf-8")


class TestRewriteSSEEvent:
    def test_copies_reasoning_content_in_delta(self):
        event = _sse_data({"choices": [{"index": 0, "delta": {"reasoning_content": "ponder"}}]})
        out = _rewrite_sse_event(event)
        assert b"data: " in out
        payload = json.loads(out[len(b"data: ") :])
        assert payload["choices"][0]["delta"]["reasoning"] == "ponder"

    def test_done_sentinel_untouched(self):
        event = b"data: [DONE]"
        assert _rewrite_sse_event(event) == event

    def test_heartbeat_comment_untouched(self):
        event = b": OPENROUTER PROCESSING"
        assert _rewrite_sse_event(event) == event

    def test_malformed_data_line_untouched(self):
        event = b"data: not-json-at-all"
        assert _rewrite_sse_event(event) == event

    def test_event_without_reasoning_passthrough(self):
        event = _sse_data({"choices": [{"index": 0, "delta": {"content": "hello"}}]})
        assert _rewrite_sse_event(event) == event

    def test_empty_event_untouched(self):
        assert _rewrite_sse_event(b"") == b""

    def test_preserves_leading_space_after_data_prefix(self):
        event = _sse_data({"choices": [{"index": 0, "delta": {"reasoning_content": "x"}}]})
        out = _rewrite_sse_event(event)
        assert out.startswith(b"data: ")

    def test_data_without_leading_space(self):
        payload = {"choices": [{"index": 0, "delta": {"reasoning_content": "x"}}]}
        event = b"data:" + json.dumps(payload).encode("utf-8")
        out = _rewrite_sse_event(event)
        assert out.startswith(b"data:")
        # still rewrote
        rest = out[len(b"data:") :]
        assert b'"reasoning":' in rest

    def test_empty_choices_passthrough(self):
        event = _sse_data({"choices": []})
        assert _rewrite_sse_event(event) == event

    def test_multiline_event_with_id_line(self):
        payload = {"choices": [{"index": 0, "delta": {"reasoning_content": "z"}}]}
        event = b"id: 42\n" + b"data: " + json.dumps(payload).encode("utf-8")
        out = _rewrite_sse_event(event)
        assert out.startswith(b"id: 42\n")
        assert b'"reasoning":' in out


# ---------------------------------------------------------------------------
# Stream wrappers
# ---------------------------------------------------------------------------


class _FakeSyncStream(httpx.SyncByteStream):
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks
        self.closed = False

    def __iter__(self) -> Iterator[bytes]:
        yield from self._chunks

    def close(self) -> None:
        self.closed = True


class _FakeAsyncStream(httpx.AsyncByteStream):
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks
        self.closed = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self._chunks:
            yield chunk

    async def aclose(self) -> None:
        self.closed = True


def _collect_sync(stream: httpx.SyncByteStream) -> bytes:
    return b"".join(stream)


async def _collect_async(stream: httpx.AsyncByteStream) -> bytes:
    return b"".join([chunk async for chunk in stream])


class TestSSERewritingSyncStream:
    def test_single_event_with_reasoning_content(self):
        payload = {"choices": [{"index": 0, "delta": {"reasoning_content": "a"}}]}
        chunks = [b"data: " + json.dumps(payload).encode() + b"\n\n"]
        stream = _SSERewritingSyncStream(_FakeSyncStream(chunks))
        out = _collect_sync(stream)
        assert out.endswith(b"\n\n")
        assert b'"reasoning":' in out

    def test_split_event_across_chunks(self):
        payload = {"choices": [{"index": 0, "delta": {"reasoning_content": "split"}}]}
        raw = b"data: " + json.dumps(payload).encode() + b"\n\n"
        stream = _SSERewritingSyncStream(_FakeSyncStream([raw[:10], raw[10:25], raw[25:]]))
        out = _collect_sync(stream)
        assert out.endswith(b"\n\n")
        assert b'"reasoning":' in out

    def test_multiple_events_in_one_chunk(self):
        p1 = {"choices": [{"index": 0, "delta": {"reasoning_content": "a"}}]}
        p2 = {"choices": [{"index": 0, "delta": {"reasoning_content": "b"}}]}
        raw = (
            b"data: " + json.dumps(p1).encode() + b"\n\ndata: " + json.dumps(p2).encode() + b"\n\n"
        )
        stream = _SSERewritingSyncStream(_FakeSyncStream([raw]))
        out = _collect_sync(stream)
        # Both events rewritten.
        events = out.split(b"\n\n")
        assert events[-1] == b""  # trailing empty string from the final split
        assert b'"reasoning":' in events[0]
        assert b'"reasoning":' in events[1]

    def test_done_passthrough(self):
        raw = b"data: [DONE]\n\n"
        stream = _SSERewritingSyncStream(_FakeSyncStream([raw]))
        assert _collect_sync(stream) == raw

    def test_heartbeat_passthrough(self):
        raw = b": OPENROUTER PROCESSING\n\n"
        stream = _SSERewritingSyncStream(_FakeSyncStream([raw]))
        assert _collect_sync(stream) == raw

    def test_trailing_bytes_without_delimiter_flushed(self):
        payload = {"choices": [{"index": 0, "delta": {"reasoning_content": "tail"}}]}
        raw = b"data: " + json.dumps(payload).encode()  # no \n\n
        stream = _SSERewritingSyncStream(_FakeSyncStream([raw]))
        out = _collect_sync(stream)
        assert b'"reasoning":' in out

    def test_empty_upstream(self):
        stream = _SSERewritingSyncStream(_FakeSyncStream([]))
        assert _collect_sync(stream) == b""

    def test_upstream_closed(self):
        upstream = _FakeSyncStream([b"data: [DONE]\n\n"])
        stream = _SSERewritingSyncStream(upstream)
        stream.close()
        assert upstream.closed is True

    def test_empty_choices_chunk_does_not_crash(self):
        """MiniMax M2.7 sometimes emits empty choices."""
        raw = b'data: {"choices": []}\n\n'
        stream = _SSERewritingSyncStream(_FakeSyncStream([raw]))
        out = _collect_sync(stream)
        assert out == raw


class TestSSERewritingAsyncStream:
    def test_single_event_with_reasoning_content(self):
        payload = {"choices": [{"index": 0, "delta": {"reasoning_content": "a"}}]}
        chunks = [b"data: " + json.dumps(payload).encode() + b"\n\n"]
        stream = _SSERewritingAsyncStream(_FakeAsyncStream(chunks))
        out = asyncio.run(_collect_async(stream))
        assert b'"reasoning":' in out

    def test_split_event_across_chunks(self):
        payload = {"choices": [{"index": 0, "delta": {"reasoning_content": "split"}}]}
        raw = b"data: " + json.dumps(payload).encode() + b"\n\n"
        stream = _SSERewritingAsyncStream(_FakeAsyncStream([raw[:10], raw[10:]]))
        out = asyncio.run(_collect_async(stream))
        assert b'"reasoning":' in out

    def test_upstream_closed(self):
        upstream = _FakeAsyncStream([b"data: [DONE]\n\n"])
        stream = _SSERewritingAsyncStream(upstream)
        asyncio.run(stream.aclose())
        assert upstream.closed is True


# ---------------------------------------------------------------------------
# Transports (via httpx.Client + MockTransport)
# ---------------------------------------------------------------------------


def _json_handler(payload: dict):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            content=json.dumps(payload).encode("utf-8"),
        )

    return handler


def _sse_handler(events: list[bytes]):
    def handler(request: httpx.Request) -> httpx.Response:
        body = b"".join(events)
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=body,
        )

    return handler


class TestReasoningNormalizingTransport:
    def test_rewrites_json_chat_completions(self):
        payload = {
            "choices": [{"index": 0, "message": {"role": "assistant", "reasoning_content": "hmm"}}]
        }
        transport = ReasoningNormalizingTransport(
            wrapped=httpx.MockTransport(_json_handler(payload))
        )
        with httpx.Client(transport=transport, base_url="https://example/v1") as client:
            resp = client.post("/chat/completions", json={})
            body = resp.json()
        assert body["choices"][0]["message"]["reasoning"] == "hmm"

    def test_content_length_updated(self):
        payload = {
            "choices": [{"index": 0, "message": {"role": "assistant", "reasoning_content": "hmm"}}]
        }
        transport = ReasoningNormalizingTransport(
            wrapped=httpx.MockTransport(_json_handler(payload))
        )
        with httpx.Client(transport=transport, base_url="https://example/v1") as client:
            resp = client.post("/chat/completions", json={})
            assert resp.headers.get("content-length") == str(len(resp.content))

    def test_non_chat_completions_path_passthrough(self):
        payload = {"reasoning_content": "ignored"}
        transport = ReasoningNormalizingTransport(
            wrapped=httpx.MockTransport(_json_handler(payload))
        )
        with httpx.Client(transport=transport, base_url="https://example/v1") as client:
            resp = client.get("/models")
        body = resp.json()
        # Not a chat/completions path, transport must not normalise.
        assert "reasoning" not in body

    def test_streaming_sse_rewritten(self):
        payload = {"choices": [{"index": 0, "delta": {"reasoning_content": "thought"}}]}
        events = [b"data: " + json.dumps(payload).encode() + b"\n\n", b"data: [DONE]\n\n"]
        transport = ReasoningNormalizingTransport(
            wrapped=httpx.MockTransport(_sse_handler(events))
        )
        with (
            httpx.Client(transport=transport, base_url="https://example/v1") as client,
            client.stream("POST", "/chat/completions", json={}) as resp,
        ):
            body = b"".join(resp.iter_bytes())
        assert b'"reasoning":' in body
        assert b"data: [DONE]\n\n" in body

    def test_accept_encoding_forced_to_identity(self):
        captured: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["accept-encoding"] = request.headers.get("accept-encoding", "")
            return httpx.Response(200, json={"choices": []})

        transport = ReasoningNormalizingTransport(wrapped=httpx.MockTransport(handler))
        with httpx.Client(transport=transport, base_url="https://example/v1") as client:
            client.post("/chat/completions", json={})
        assert captured["accept-encoding"] == "identity"


class TestReasoningNormalizingAsyncTransport:
    def test_rewrites_json_chat_completions(self):
        payload = {
            "choices": [{"index": 0, "message": {"role": "assistant", "reasoning_content": "hmm"}}]
        }

        async def run():
            transport = ReasoningNormalizingAsyncTransport(
                wrapped=httpx.MockTransport(_json_handler(payload))
            )
            async with httpx.AsyncClient(
                transport=transport, base_url="https://example/v1"
            ) as client:
                resp = await client.post("/chat/completions", json={})
                return resp.json()

        body = asyncio.run(run())
        assert body["choices"][0]["message"]["reasoning"] == "hmm"

    def test_streaming_sse_rewritten(self):
        payload = {"choices": [{"index": 0, "delta": {"reasoning_content": "thought"}}]}
        events = [b"data: " + json.dumps(payload).encode() + b"\n\n", b"data: [DONE]\n\n"]

        async def run():
            transport = ReasoningNormalizingAsyncTransport(
                wrapped=httpx.MockTransport(_sse_handler(events))
            )
            async with (
                httpx.AsyncClient(transport=transport, base_url="https://example/v1") as client,
                client.stream("POST", "/chat/completions", json={}) as resp,
            ):
                return b"".join([chunk async for chunk in resp.aiter_bytes()])

        body = asyncio.run(run())
        assert b'"reasoning":' in body


# ---------------------------------------------------------------------------
# ChatOpenCodeGo wiring
# ---------------------------------------------------------------------------


class TestChatOpenCodeGo:
    def test_constructs_with_default_base_url(self):
        model = ChatOpenCodeGo(
            model="kimi-k2.6",
            api_key="sk-x",  # pragma: allowlist secret
            base_url=OPENCODE_GO_BASE_URL,
        )
        # The SDK client is built from _build_client; the underlying
        # openrouter.OpenRouter is stored on ``model.client``.
        assert model.client is not None
        assert model.openrouter_api_base == OPENCODE_GO_BASE_URL

    def test_build_client_installs_reasoning_transport(self):
        model = ChatOpenCodeGo(
            model="kimi-k2.6",
            api_key="sk-x",  # pragma: allowlist secret
            base_url=OPENCODE_GO_BASE_URL,
        )
        # The openrouter SDK exposes an internal httpx client. Its underlying
        # transport should be our reasoning-normalising transport.
        sdk = model.client
        # The SDK stores its sync httpx client under ``client_supplier``'s
        # resolved instance, which varies by version. Probe commonly-used
        # attributes to find it without over-specifying.
        probe_candidates = [
            getattr(sdk, "client", None),
            getattr(sdk, "_client", None),
            getattr(sdk, "sdk_configuration", None),
        ]
        found = False
        for candidate in probe_candidates:
            if candidate is None:
                continue
            for attr in ("client", "client_", "async_client", "async_client_"):
                httpx_client = getattr(candidate, attr, None)
                if isinstance(httpx_client, (httpx.Client, httpx.AsyncClient)) and isinstance(
                    httpx_client._transport,
                    (ReasoningNormalizingTransport, ReasoningNormalizingAsyncTransport),
                ):
                    found = True
                    break
            if found:
                break
        assert found, "ChatOpenCodeGo did not install reasoning-normalising transport"


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__, "-v"])
