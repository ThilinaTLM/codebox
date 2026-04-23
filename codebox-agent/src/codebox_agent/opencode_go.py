"""OpenCode Go provider support.

OpenCode Go (``https://opencode.ai/zen/go/v1``) speaks the OpenRouter wire
format, so this module ships a thin :class:`ChatOpenRouter` subclass that
points the OpenRouter SDK at the Go base URL.

Six of the Go models (GLM-5/5.1, Qwen3.5/3.6 Plus, MiniMax M2.5/M2.7) emit
reasoning tokens under the ``reasoning_content`` wire field instead of
``reasoning``. The OpenRouter Python SDK uses Pydantic response models with
the default ``extra="ignore"`` setting which silently drops unknown fields
before :class:`ChatOpenRouter` ever sees them. The only viable intercept
point is below the SDK, at the raw ``httpx`` layer, which is what the
custom transports in this module do: they rewrite responses to
``/chat/completions`` on the fly, copying ``reasoning_content`` into
``reasoning`` when the latter is absent.
"""

from __future__ import annotations

import contextlib
import json
from typing import TYPE_CHECKING, Any

import httpx
from langchain_openrouter import ChatOpenRouter

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Iterator

__all__ = [
    "OPENCODE_GO_BASE_URL",
    "ChatOpenCodeGo",
    "ReasoningNormalizingAsyncTransport",
    "ReasoningNormalizingTransport",
]

OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1"

_CHAT_COMPLETIONS_SUFFIX = "/chat/completions"
_SSE_EVENT_DELIMITER = b"\n\n"


# ---------------------------------------------------------------------------
# Pure rewrite helpers
# ---------------------------------------------------------------------------


def _normalize_reasoning(obj: Any) -> bool:
    """Copy ``reasoning_content`` into ``reasoning`` when absent.

    Returns ``True`` if the object was mutated. Returns ``False`` if
    ``obj`` is not a dict, ``reasoning_content`` is missing/empty, or
    ``reasoning`` is already populated (in which case the upstream value
    wins and we leave the message untouched).
    """
    if not isinstance(obj, dict):
        return False
    rc = obj.get("reasoning_content")
    if rc in (None, ""):
        return False
    if obj.get("reasoning") not in (None, ""):
        return False
    obj["reasoning"] = rc
    return True


def _normalize_payload(payload: Any) -> bool:
    """Walk a chat/completions payload and normalise every choice.

    Handles both streaming (``choice.delta``) and non-streaming
    (``choice.message``) shapes. Returns ``True`` if anything changed.
    """
    if not isinstance(payload, dict):
        return False
    choices = payload.get("choices")
    if not isinstance(choices, list):
        return False
    changed = False
    for choice in choices:
        if not isinstance(choice, dict):
            continue
        if _normalize_reasoning(choice.get("message")):
            changed = True
        if _normalize_reasoning(choice.get("delta")):
            changed = True
    return changed


def _rewrite_chat_json(body: bytes) -> bytes:
    """Rewrite a non-streaming ``/chat/completions`` JSON body.

    Malformed JSON or non-dict payloads are returned unchanged.
    """
    if not body:
        return body
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return body
    if not _normalize_payload(payload):
        return body
    # ``ensure_ascii=False`` keeps the payload byte-compatible with the
    # upstream (which sends UTF-8 JSON).
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _rewrite_sse_event(event: bytes) -> bytes:
    """Rewrite a single SSE event block (bytes between ``\\n\\n`` delimiters).

    The block may contain multiple ``data:`` / comment / field lines. Only
    ``data:`` lines carrying a JSON chat chunk are touched; heartbeats
    (``: ...`` comment lines) and the ``[DONE]`` sentinel are preserved
    byte-for-byte. Malformed JSON ``data:`` lines are also left unchanged.
    """
    if not event:
        return event
    lines = event.split(b"\n")
    rewritten: list[bytes] = []
    changed = False
    for line in lines:
        if not line.startswith(b"data:"):
            rewritten.append(line)
            continue
        raw = line[len(b"data:") :]
        # Preserve a single leading space (the canonical SSE wire shape).
        if raw.startswith(b" "):
            prefix = b"data: "
            raw = raw[1:]
        else:
            prefix = b"data:"
        stripped = raw.strip()
        if not stripped or stripped == b"[DONE]":
            rewritten.append(line)
            continue
        try:
            payload = json.loads(stripped)
        except (ValueError, UnicodeDecodeError):
            rewritten.append(line)
            continue
        if _normalize_payload(payload):
            new_body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            rewritten.append(prefix + new_body)
            changed = True
        else:
            rewritten.append(line)
    if not changed:
        return event
    return b"\n".join(rewritten)


# ---------------------------------------------------------------------------
# SSE-rewriting byte streams
# ---------------------------------------------------------------------------


class _SSEBuffer:
    """Shared ``\\n\\n``-delimited event buffer used by both stream wrappers."""

    __slots__ = ("_buf",)

    def __init__(self) -> None:
        self._buf = b""

    def feed(self, chunk: bytes) -> list[bytes]:
        """Append ``chunk`` and return any complete events ready to emit.

        Each returned element is a fully-rewritten event followed by the
        ``\\n\\n`` delimiter so concatenation reproduces the wire stream.
        """
        if not chunk:
            return []
        self._buf += chunk
        events: list[bytes] = []
        while True:
            idx = self._buf.find(_SSE_EVENT_DELIMITER)
            if idx < 0:
                break
            event = self._buf[:idx]
            self._buf = self._buf[idx + len(_SSE_EVENT_DELIMITER) :]
            events.append(_rewrite_sse_event(event) + _SSE_EVENT_DELIMITER)
        return events

    def flush(self) -> bytes:
        """Emit any trailing bytes (no terminating delimiter in the wire)."""
        if not self._buf:
            return b""
        event = self._buf
        self._buf = b""
        return _rewrite_sse_event(event)


class _SSERewritingSyncStream(httpx.SyncByteStream):
    """Wrap an upstream sync byte stream and rewrite SSE events on the fly."""

    def __init__(self, upstream: httpx.SyncByteStream) -> None:
        self._upstream = upstream
        self._buffer = _SSEBuffer()

    def __iter__(self) -> Iterator[bytes]:
        for chunk in self._upstream:
            yield from self._buffer.feed(chunk)
        tail = self._buffer.flush()
        if tail:
            yield tail

    def close(self) -> None:
        self._upstream.close()


class _SSERewritingAsyncStream(httpx.AsyncByteStream):
    """Async counterpart to :class:`_SSERewritingSyncStream`."""

    def __init__(self, upstream: httpx.AsyncByteStream) -> None:
        self._upstream = upstream
        self._buffer = _SSEBuffer()

    async def __aiter__(self) -> AsyncIterator[bytes]:
        async for chunk in self._upstream:
            for event in self._buffer.feed(chunk):
                yield event
        tail = self._buffer.flush()
        if tail:
            yield tail

    async def aclose(self) -> None:
        await self._upstream.aclose()


# ---------------------------------------------------------------------------
# Transports
# ---------------------------------------------------------------------------


def _is_chat_completions(request: httpx.Request) -> bool:
    path = request.url.path or ""
    return path.endswith(_CHAT_COMPLETIONS_SUFFIX)


def _content_type(response: httpx.Response) -> str:
    raw = response.headers.get("content-type", "")
    return raw.split(";", 1)[0].strip().lower()


def _force_identity_encoding(request: httpx.Request) -> None:
    """Disable compression so we can rewrite raw response bytes.

    The SSE stream path can't decompress incrementally, and for the JSON
    path we'd have to re-compress to keep ``Content-Encoding`` honest.
    Forcing identity keeps the transport simple and correct. ``httpx``
    adds ``Accept-Encoding: gzip, deflate`` by default; we override only
    for ``/chat/completions`` requests.
    """
    request.headers["accept-encoding"] = "identity"


def _invalidate_cached_content(response: httpx.Response) -> None:
    """Drop ``_content`` / ``is_stream_consumed`` so a replaced stream wins.

    Responses built by ``httpx.Response(content=...)`` (used by
    ``MockTransport``) pre-populate ``_content``. In production
    ``HTTPTransport`` does not set it, but we drop the attribute
    unconditionally so that the downstream client re-reads from the
    stream we just installed.
    """
    for attr in ("_content",):
        if hasattr(response, attr):
            with contextlib.suppress(AttributeError):
                delattr(response, attr)
    # Reset the stream-consumption flag; httpx raises ``StreamConsumed`` if
    # it was tripped by an earlier read we performed ourselves.
    if getattr(response, "is_stream_consumed", False):
        response.is_stream_consumed = False
    if getattr(response, "is_closed", False):
        response.is_closed = False


def _replace_json_body(response: httpx.Response, body: bytes) -> None:
    _invalidate_cached_content(response)
    response.stream = httpx.ByteStream(body)
    if "content-length" in response.headers:
        response.headers["content-length"] = str(len(body))


def _replace_sse_stream(
    response: httpx.Response,
    stream: httpx.SyncByteStream | httpx.AsyncByteStream,
) -> None:
    _invalidate_cached_content(response)
    response.stream = stream  # type: ignore[assignment]
    # SSE bodies don't carry a fixed content-length; drop any stale one so
    # httpx doesn't short-read.
    response.headers.pop("content-length", None)


def _read_sync_stream(stream: httpx.SyncByteStream) -> bytes:
    try:
        return b"".join(stream)
    finally:
        stream.close()


async def _read_async_stream(stream: httpx.AsyncByteStream) -> bytes:
    try:
        return b"".join([chunk async for chunk in stream])
    finally:
        await stream.aclose()


class ReasoningNormalizingTransport(httpx.BaseTransport):
    """Sync httpx transport that copies ``reasoning_content`` → ``reasoning``."""

    def __init__(self, wrapped: httpx.BaseTransport | None = None) -> None:
        self._wrapped = wrapped or httpx.HTTPTransport()

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        if _is_chat_completions(request):
            _force_identity_encoding(request)
        response = self._wrapped.handle_request(request)
        if not _is_chat_completions(request):
            return response
        ctype = _content_type(response)
        if ctype == "application/json":
            body = _read_sync_stream(response.stream)  # type: ignore[arg-type]
            _replace_json_body(response, _rewrite_chat_json(body))
        elif ctype == "text/event-stream":
            _replace_sse_stream(
                response,
                _SSERewritingSyncStream(response.stream),  # type: ignore[arg-type]
            )
        return response

    def close(self) -> None:
        self._wrapped.close()


class ReasoningNormalizingAsyncTransport(httpx.AsyncBaseTransport):
    """Async httpx transport that copies ``reasoning_content`` → ``reasoning``."""

    def __init__(self, wrapped: httpx.AsyncBaseTransport | None = None) -> None:
        self._wrapped = wrapped or httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if _is_chat_completions(request):
            _force_identity_encoding(request)
        response = await self._wrapped.handle_async_request(request)
        if not _is_chat_completions(request):
            return response
        ctype = _content_type(response)
        if ctype == "application/json":
            body = await _read_async_stream(response.stream)  # type: ignore[arg-type]
            _replace_json_body(response, _rewrite_chat_json(body))
        elif ctype == "text/event-stream":
            _replace_sse_stream(
                response,
                _SSERewritingAsyncStream(response.stream),  # type: ignore[arg-type]
            )
        return response

    async def aclose(self) -> None:
        await self._wrapped.aclose()


# ---------------------------------------------------------------------------
# ChatOpenCodeGo
# ---------------------------------------------------------------------------


class ChatOpenCodeGo(ChatOpenRouter):
    """``ChatOpenRouter`` subclass pointed at OpenCode Go.

    Always installs :class:`ReasoningNormalizingTransport` /
    :class:`ReasoningNormalizingAsyncTransport` so that responses from
    ``/chat/completions`` get their ``reasoning_content`` field copied
    into ``reasoning`` before the OpenRouter SDK's Pydantic models parse
    and drop the unknown field.
    """

    def _build_client(self) -> Any:
        import openrouter  # noqa: PLC0415
        from openrouter.utils import (  # noqa: PLC0415
            BackoffStrategy,
            RetryConfig,
        )

        api_key = self.openrouter_api_key
        assert api_key is not None, "OPENROUTER_API_KEY must be set"
        client_kwargs: dict[str, Any] = {
            "api_key": api_key.get_secret_value(),
        }
        if self.openrouter_api_base:
            client_kwargs["server_url"] = self.openrouter_api_base
        if self.app_url:
            client_kwargs["http_referer"] = self.app_url
        if self.app_title:
            client_kwargs["x_title"] = self.app_title

        extra_headers: dict[str, str] | None = None
        if self.app_categories:
            extra_headers = {
                "X-OpenRouter-Categories": ",".join(self.app_categories),
            }

        client_kwargs["client"] = httpx.Client(
            transport=ReasoningNormalizingTransport(),
            headers=extra_headers,
            follow_redirects=True,
        )
        client_kwargs["async_client"] = httpx.AsyncClient(
            transport=ReasoningNormalizingAsyncTransport(),
            headers=extra_headers,
            follow_redirects=True,
        )

        if self.request_timeout is not None:
            client_kwargs["timeout_ms"] = self.request_timeout
        if self.max_retries > 0:
            client_kwargs["retry_config"] = RetryConfig(
                strategy="backoff",
                backoff=BackoffStrategy(
                    initial_interval=500,
                    max_interval=60000,
                    exponent=1.5,
                    max_elapsed_time=self.max_retries * 150_000,
                ),
                retry_connection_errors=True,
            )
        return openrouter.OpenRouter(**client_kwargs)
