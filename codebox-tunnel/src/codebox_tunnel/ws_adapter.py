"""Async WebSocket ↔ byte-stream adapter for yamux.

yamux requires a plain read/write/close byte-stream interface.  WebSocket
is message-based, so this adapter buffers partially consumed messages on
reads and sends one binary message per write.

Supports both the ``websockets`` library (used by the sandbox client) and
FastAPI/Starlette ``WebSocket`` (used by the orchestrator server).
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any


class AsyncWSAdapter:
    """Adapts a WebSocket connection to an async byte-stream for yamux.

    Parameters
    ----------
    ws:
        Either a ``websockets.WebSocketClientProtocol`` (sandbox side)
        or a ``starlette.websockets.WebSocket`` (orchestrator side).
    """

    def __init__(self, ws: Any) -> None:
        self._ws = ws
        self._buf = bytearray()
        self._write_lock = asyncio.Lock()
        self._closed = False

    async def read(self, n: int) -> bytes:
        """Read exactly *n* bytes, buffering WebSocket messages as needed."""
        while len(self._buf) < n:
            if self._closed:
                return b""
            try:
                msg = await self._recv()
            except Exception:
                self._closed = True
                return b""
            if msg is None:
                self._closed = True
                return b""
            if isinstance(msg, str):
                msg = msg.encode()
            self._buf.extend(msg)

        result = bytes(self._buf[:n])
        del self._buf[:n]
        return result

    async def write(self, data: bytes) -> None:
        """Send *data* as a single binary WebSocket message."""
        if self._closed:
            raise ConnectionError("WebSocket closed")
        async with self._write_lock:
            await self._send(data)

    async def close(self) -> None:
        """Close the underlying WebSocket."""
        if self._closed:
            return
        self._closed = True
        with contextlib.suppress(Exception):
            await self._ws.close()

    # -- Transport-specific dispatch ----------------------------------------

    async def _recv(self) -> bytes | str | None:
        """Receive the next message from the WebSocket."""
        ws = self._ws

        # Starlette WebSocket (FastAPI)
        if hasattr(ws, "receive_bytes"):
            try:
                return await ws.receive_bytes()
            except Exception:
                return None

        # websockets library
        if hasattr(ws, "recv"):
            return await ws.recv()

        raise TypeError(f"Unsupported WebSocket type: {type(ws)}")

    async def _send(self, data: bytes) -> None:
        """Send a binary message through the WebSocket."""
        ws = self._ws

        # Starlette WebSocket (FastAPI)
        if hasattr(ws, "send_bytes"):
            await ws.send_bytes(data)
            return

        # websockets library
        if hasattr(ws, "send"):
            await ws.send(data)
            return

        raise TypeError(f"Unsupported WebSocket type: {type(ws)}")
