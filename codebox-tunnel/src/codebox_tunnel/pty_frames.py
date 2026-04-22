"""Length-prefixed frame protocol for the sandbox PTY server.

Each frame on the stream is::

    ┌──────────┬───────────────┬──────────────────────┐
    │ type:u8  │ len:u32 (BE)  │ payload (len bytes)  │
    └──────────┴───────────────┴──────────────────────┘

Frame types (see ``PTYFrameType``):

===== ========= =================== =====================================
 Byte  Name      Direction            Payload
===== ========= =================== =====================================
 0x01  OPEN      client → server     UTF-8 JSON: ``{"cols", "rows",
                                     "shell", "cwd"}``
 0x02  STDIN     client → server     raw bytes (typed input)
 0x03  RESIZE    client → server     UTF-8 JSON: ``{"cols", "rows"}``
 0x10  STDOUT    server → client     raw bytes (PTY output)
 0x11  EXIT      server → client     UTF-8 JSON: ``{"exit_code",
                                     "signal"|null}``
===== ========= =================== =====================================

The channel is the yamux stream dialed to ``PTY_SERVER_PORT``; yamux
handles keepalive and backpressure, so we add no heartbeat at this
layer.

The ``reader`` / ``writer`` parameters are intentionally typed ``Any`` —
both ``asyncio.StreamReader`` / ``asyncio.StreamWriter`` and the yamux
stream class satisfy the needed ``readexactly`` / ``write`` + ``drain``
methods structurally.
"""

from __future__ import annotations

import enum
import inspect
import struct
from typing import Any

__all__ = [
    "FRAME_HEADER_FMT",
    "FRAME_HEADER_SIZE",
    "MAX_FRAME_PAYLOAD",
    "PTYFrameType",
    "read_frame",
    "write_frame",
]

# ``>BI`` = type(1) + length(4, big-endian)
FRAME_HEADER_FMT: str = ">BI"
FRAME_HEADER_SIZE: int = struct.calcsize(FRAME_HEADER_FMT)

# Defensive upper bound — prevents a buggy/malicious peer from allocating
# gigabytes.  Terminal output chunks are tiny (kernel PTY buffer is 4 KB),
# and JSON control messages are a few hundred bytes at most.  1 MiB is
# generous headroom.
MAX_FRAME_PAYLOAD: int = 1 * 1024 * 1024


class PTYFrameType(enum.IntEnum):
    OPEN = 0x01
    STDIN = 0x02
    RESIZE = 0x03
    STDOUT = 0x10
    EXIT = 0x11


async def _readexactly(reader: Any, n: int) -> bytes:
    """Call the reader's read-exactly method regardless of naming.

    ``asyncio.StreamReader`` exposes ``readexactly``; ``AsyncYamuxStream``
    exposes ``read_exactly``.  Both are async and semantically identical
    for our purposes.
    """
    fn = getattr(reader, "readexactly", None) or getattr(reader, "read_exactly", None)
    if fn is None:
        raise TypeError("PTY frame reader must expose readexactly() or read_exactly()")
    return await fn(n)


async def _write_and_drain(writer: Any, data: bytes) -> None:
    """Write ``data`` through either an ``asyncio.StreamWriter`` or an
    ``AsyncYamuxStream``.

    * ``asyncio.StreamWriter.write`` is sync and requires a follow-up
      ``await writer.drain()`` for backpressure.
    * ``AsyncYamuxStream.write`` is itself an async coroutine that handles
      backpressure internally and has no ``drain`` method.
    """
    result = writer.write(data)
    if inspect.isawaitable(result):
        await result
        return
    drain = getattr(writer, "drain", None)
    if drain is not None:
        await drain()


async def read_frame(reader: Any) -> tuple[int, bytes]:
    """Read one frame.  Returns ``(frame_type, payload)``.

    ``reader`` must expose either ``async def readexactly(n: int) -> bytes``
    (``asyncio.StreamReader``) or ``async def read_exactly(n: int) -> bytes``
    (``AsyncYamuxStream``).

    Raises ``asyncio.IncompleteReadError`` / ``EOFError`` on EOF
    (propagated from the underlying reader) and ``ValueError`` on a
    malformed length.
    """
    header = await _readexactly(reader, FRAME_HEADER_SIZE)
    frame_type, length = struct.unpack(FRAME_HEADER_FMT, header)
    if length > MAX_FRAME_PAYLOAD:
        raise ValueError(f"PTY frame too large: {length} > {MAX_FRAME_PAYLOAD}")
    if length == 0:
        return frame_type, b""
    payload = await _readexactly(reader, length)
    return frame_type, payload


async def write_frame(writer: Any, frame_type: int, payload: bytes = b"") -> None:
    """Write one frame.

    ``writer`` may be either an ``asyncio.StreamWriter`` (sync
    ``write`` + awaitable ``drain``) or an ``AsyncYamuxStream``
    (awaitable ``write``, no ``drain``).  The frame is sent in a single
    ``write`` call so it cannot be interleaved with another writer's
    frame on the same yamux stream.
    """
    if len(payload) > MAX_FRAME_PAYLOAD:
        raise ValueError(f"PTY frame too large: {len(payload)} > {MAX_FRAME_PAYLOAD}")
    header = struct.pack(FRAME_HEADER_FMT, frame_type, len(payload))
    await _write_and_drain(writer, header + payload if payload else header)
