"""HTTP reverse proxy through yamux streams.

Sends an HTTP/1.1 request through a yamux stream connected to a service
inside the sandbox, reads the response, and returns it.  Supports both
buffered (small JSON responses) and streaming (large file downloads) modes.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from codebox_tunnel import AsyncYamuxStream

logger = logging.getLogger(__name__)

_READ_CHUNK = 16384


async def proxy_request(
    stream: AsyncYamuxStream,
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
) -> tuple[int, dict[str, str], bytes]:
    """Send an HTTP/1.1 request through *stream* and return the full response.

    Returns ``(status_code, response_headers, response_body)``.
    """
    await _write_request(stream, method, path, headers, body)

    status, resp_headers = await _read_status_and_headers(stream)
    resp_body = await _read_body(stream, resp_headers)
    await stream.close()
    return status, resp_headers, resp_body


async def proxy_request_streaming(
    stream: AsyncYamuxStream,
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
) -> tuple[int, dict[str, str], AsyncIterator[bytes]]:
    """Send HTTP request, return status/headers and an async body iterator.

    The caller is responsible for consuming the iterator and closing the stream.
    """
    await _write_request(stream, method, path, headers, body)

    status, resp_headers = await _read_status_and_headers(stream)

    async def _body_iter() -> AsyncIterator[bytes]:
        content_length = int(resp_headers.get("content-length", "0"))
        remaining = content_length
        try:
            while remaining > 0:
                chunk = await stream.read(min(_READ_CHUNK, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
        finally:
            await stream.close()

    return status, resp_headers, _body_iter()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _write_request(
    stream: AsyncYamuxStream,
    method: str,
    path: str,
    headers: dict[str, str] | None,
    body: bytes | None,
) -> None:
    """Compose and write a minimal HTTP/1.1 request."""
    hdrs = headers.copy() if headers else {}
    if body:
        hdrs["Content-Length"] = str(len(body))
    hdrs.setdefault("Host", "localhost")
    hdrs.setdefault("Connection", "close")

    lines = [f"{method} {path} HTTP/1.1"]
    for k, v in hdrs.items():
        lines.append(f"{k}: {v}")
    lines.append("")
    lines.append("")
    request_bytes = "\r\n".join(lines).encode("utf-8")

    if body:
        request_bytes += body

    await stream.write(request_bytes)


async def _read_status_and_headers(
    stream: AsyncYamuxStream,
) -> tuple[int, dict[str, str]]:
    """Read the HTTP response status line and headers."""
    buf = bytearray()
    while b"\r\n\r\n" not in buf:
        chunk = await stream.read(_READ_CHUNK)
        if not chunk:
            break
        buf.extend(chunk)

    header_end = buf.index(b"\r\n\r\n")
    header_block = buf[:header_end].decode("utf-8", errors="replace")
    # Put any extra bytes back (they're part of the body)
    leftover = bytes(buf[header_end + 4 :])

    lines = header_block.split("\r\n")
    # Status line: "HTTP/1.1 200 OK"
    status_line = lines[0]
    parts = status_line.split(" ", 2)
    status_code = int(parts[1]) if len(parts) >= 2 else 500

    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()

    # Stash leftover bytes so _read_body can use them
    # Push leftover bytes back into the stream's receive buffer so
    # that the subsequent body read picks them up.
    if leftover:
        stream._recv_buf = bytearray(leftover) + stream._recv_buf  # noqa: SLF001
        stream._recv_event.set()  # noqa: SLF001

    return status_code, headers


async def _read_body(
    stream: AsyncYamuxStream,
    headers: dict[str, str],
) -> bytes:
    """Read the full response body based on Content-Length."""
    content_length = int(headers.get("content-length", "0"))
    if content_length == 0:
        return b""

    body = bytearray()
    while len(body) < content_length:
        chunk = await stream.read(min(_READ_CHUNK, content_length - len(body)))
        if not chunk:
            break
        body.extend(chunk)
    return bytes(body)
