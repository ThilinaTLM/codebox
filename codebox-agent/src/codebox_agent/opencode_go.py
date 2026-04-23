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

Outbound image handling
-----------------------

The deepagents filesystem tools return PNG/JPEG reads as LangChain v1
multimodal ``ToolMessage`` content blocks of the form
``{"type": "image", "base64": "...", "mime_type": "image/png"}``.

``langchain_openrouter`` does not translate those blocks when serialising a
``ToolMessage`` (it only formats ``HumanMessage`` content, and only for the
``video`` / ``file`` block types), so the raw block reaches the OpenRouter
SDK's Pydantic models, which validate ``type`` against a
``Literal["image_url"]`` and reject the payload with eight union-branch
errors.

The OpenRouter SDK's ``ToolResponseMessage.content`` is typed as
``Union[str, List[ChatMessageContentItem]]``, so image parts **are** valid
inside ``role: "tool"`` messages as long as they use the OpenAI-style
``{"type": "image_url", "image_url": {"url": "data:..."}}`` shape. That
also matches the multimodal tool-response example in Moonshot's Kimi K2.6
quickstart. We therefore translate each LangChain image block in place:

*   For vision-capable Go models (see :data:`VISION_MODELS`), image blocks
    are rewritten to the canonical OpenAI ``image_url`` shape inside
    whichever message carries them (tool or human).
*   For text-only Go models (``glm-5/5.1``, ``qwen3.5/3.6-plus``,
    ``mimo-v2-pro``, ``mimo-v2.5-pro``, ``minimax-m2.5/2.7``), the image
    block is replaced with a short text placeholder so the model is told
    truthfully that a PNG/JPEG was read but cannot be shown, instead of
    failing wire validation or hallucinating a description.
"""

from __future__ import annotations

import contextlib
import json
from typing import TYPE_CHECKING, Any, ClassVar

import httpx
from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage
from langchain_openrouter import ChatOpenRouter

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Iterator

__all__ = [
    "OPENCODE_GO_BASE_URL",
    "VISION_MODELS",
    "ChatOpenCodeGo",
    "ReasoningNormalizingAsyncTransport",
    "ReasoningNormalizingTransport",
    "rewrite_multimodal_messages",
]

OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1"

_CHAT_COMPLETIONS_SUFFIX = "/chat/completions"
_SSE_EVENT_DELIMITER = b"\n\n"

# Vision-capable OpenCode Go models. A model belongs here when the upstream
# vendor advertises visual input and the Go endpoint routes it through an
# OpenAI-compatible ``/chat/completions`` path. Anything else is treated as
# text-only. Non-Go model IDs (e.g. ``moonshotai/kimi-k2.6`` served directly
# from Moonshot / OpenRouter) are also included so callers that reuse the
# helper with the base ``ChatOpenRouter`` get the same behaviour.
#
# Sources:
#   * https://platform.moonshot.ai/docs/guide/kimi-k2-6-quickstart
#     ("native multimodal architecture that supports text, image, and video
#     input")
#   * https://platform.moonshot.ai/docs/pricing/chat-k25
#     ("supports visual and text input")
VISION_MODELS: frozenset[str] = frozenset(
    {
        "kimi-k2.5",
        "kimi-k2.6",
        "moonshotai/kimi-k2.5",
        "moonshotai/kimi-k2.6",
    }
)


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
# Outbound multimodal content-block rewriting
# ---------------------------------------------------------------------------


def _is_lc_image_block(block: Any) -> bool:
    """Return ``True`` for a LangChain v1 multimodal image data block.

    The canonical shape is ``{"type": "image", "base64": str, "mime_type": str}``
    (with optional ``id`` / ``url`` / ``file_id`` variants). We only need to
    recognise base64-backed image blocks here because that's what the
    deepagents filesystem tools produce; the other variants round-trip fine
    through the existing OpenRouter conversion path.
    """
    if not isinstance(block, dict):
        return False
    if block.get("type") != "image":
        return False
    # Presence of ``base64`` (or ``url``) is what distinguishes a data block
    # from an already-translated OpenAI ``image_url`` part.
    return "base64" in block or "url" in block


def _image_block_to_openai_part(block: dict[str, Any]) -> dict[str, Any]:
    """Convert an LC v1 image data block to an OpenAI ``image_url`` part.

    Accepts either ``base64`` + ``mime_type`` or an explicit ``url``. The
    resulting part is the shape every OpenAI-compatible provider expects,
    and matches the OpenRouter SDK's ``ChatMessageContentItemImage`` schema.
    """
    url = block.get("url")
    if not url:
        mime = block.get("mime_type") or "image/png"
        b64 = block.get("base64") or ""
        url = f"data:{mime};base64,{b64}"
    return {"type": "image_url", "image_url": {"url": url}}


def _image_block_placeholder_text(block: dict[str, Any], *, vision: bool) -> str:
    mime = block.get("mime_type") or "image/*"
    b64 = block.get("base64") or ""
    # Approximate decoded size from the base64 payload (4 base64 chars ≈ 3
    # bytes). Good enough for a human-readable hint.
    approx_bytes = (len(b64) * 3) // 4 if b64 else 0
    size_hint = f"{approx_bytes / 1024:.1f} KB" if approx_bytes else "unknown size"
    if vision:
        # Reserved for future paths (e.g. transports that must strip images
        # anyway); the current rewriter keeps image parts inline for vision
        # models so this branch is not on the hot path.
        return f"[image: {mime}, {size_hint}]"
    return f"[image omitted: {mime}, {size_hint} — current model does not support vision input]"


def _rewrite_image_blocks(content: Any, *, vision: bool) -> Any:
    """Translate LangChain image data blocks inside ``content``.

    Returns ``content`` unchanged when it carries no image data blocks, so
    callers can cheaply skip rewriting untouched messages. Otherwise
    returns a new ``list`` where each image block is either:

    *   rewritten in place to an OpenAI ``image_url`` part (``vision=True``), or
    *   replaced with a short text placeholder (``vision=False``).

    String content is passed through unchanged — the deepagents tools only
    emit image blocks inside list content, and translating a bare string to
    a list would only add noise.
    """
    if not isinstance(content, list):
        return content
    new_blocks: list[Any] = []
    touched = False
    for block in content:
        if _is_lc_image_block(block):
            if vision:
                new_blocks.append(_image_block_to_openai_part(block))
            else:
                new_blocks.append(
                    {
                        "type": "text",
                        "text": _image_block_placeholder_text(block, vision=False),
                    }
                )
            touched = True
        else:
            new_blocks.append(block)
    return new_blocks if touched else content


def rewrite_multimodal_messages(
    messages: list[BaseMessage],
    *,
    model: str,
    vision_models: frozenset[str] = VISION_MODELS,
) -> list[BaseMessage]:
    """Rewrite outbound messages so multimodal blocks match the target model.

    *   For vision-capable models, every LangChain image data block in a
        ``ToolMessage`` or ``HumanMessage`` is rewritten in place to the
        canonical OpenAI ``image_url`` shape. The block stays inside the
        original message (including ``role: "tool"`` messages — the
        OpenRouter SDK and Moonshot both accept image parts there).
    *   For text-only models, image blocks are replaced with a text
        placeholder so the model is told truthfully that a binary asset was
        read but cannot be shown, and the request still passes the SDK's
        schema validation.
    *   All other message types and non-image blocks are untouched.

    The function is pure — it returns a new list (only reallocating the
    messages whose content actually changed) and does not mutate inputs.
    """
    vision = model in vision_models
    out: list[BaseMessage] = []
    for msg in messages:
        if isinstance(msg, (ToolMessage, HumanMessage)):
            new_content = _rewrite_image_blocks(msg.content, vision=vision)
            if new_content is msg.content:
                out.append(msg)
            else:
                out.append(msg.model_copy(update={"content": new_content}))
            continue
        # SystemMessage / AIMessage / ChatMessage: pass through unchanged.
        # AIMessage image parts would come from the model itself and are
        # already filtered to text blocks by the base OpenRouter converter.
        out.append(msg)
    return out


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

    Also rewrites outbound ``ToolMessage`` / ``HumanMessage`` content
    blocks so that multimodal image payloads from deepagents' filesystem
    tools are either translated to OpenAI-style ``image_url`` parts (for
    vision-capable models listed in :data:`VISION_MODELS`) or replaced
    with a text placeholder (for text-only models). See the module
    docstring for the motivation and wire details.
    """

    #: Vision-capable model allow-list. Declared as a ``ClassVar`` so it
    #: stays out of the ``ChatOpenRouter`` Pydantic field schema. Subclass
    #: and override, or reassign on the class, to broaden support.
    vision_models: ClassVar[frozenset[str]] = VISION_MODELS

    def _create_message_dicts(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        rewritten = rewrite_multimodal_messages(
            messages,
            model=self.model,
            vision_models=self.vision_models,
        )
        return super()._create_message_dicts(rewritten, stop)

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
