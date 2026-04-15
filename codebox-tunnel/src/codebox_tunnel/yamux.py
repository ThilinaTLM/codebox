"""Async yamux (Yet Another Multiplexer) implementation.

Implements both client and server sides of the yamux protocol as specified at
https://github.com/hashicorp/yamux/blob/master/spec.md

Supports opening streams (outgoing) and accepting streams (incoming) on both
roles.  Session initiator uses odd stream IDs; acceptor uses even IDs.
"""

# ruff: noqa: SLF001 S110

from __future__ import annotations

import asyncio
import contextlib
import logging
import struct
from typing import Literal, Protocol

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Protocol constants
# ---------------------------------------------------------------------------

_VERSION = 0

_TYPE_DATA = 0
_TYPE_WINDOW_UPDATE = 1
_TYPE_PING = 2
_TYPE_GO_AWAY = 3

_FLAG_SYN = 0x0001
_FLAG_ACK = 0x0002
_FLAG_FIN = 0x0004
_FLAG_RST = 0x0008

_HEADER_SIZE = 12
_HEADER_FMT = ">BBHII"  # version(1), type(1), flags(2), streamID(4), length(4)

_INITIAL_WINDOW_SIZE = 256 * 1024  # 256 KB
_KEEPALIVE_INTERVAL = 30  # seconds


# ---------------------------------------------------------------------------
# Async byte-stream interface
# ---------------------------------------------------------------------------


class AsyncReadWriteCloser(Protocol):
    """Byte-stream interface for the underlying transport (e.g. WebSocket)."""

    async def read(self, n: int) -> bytes: ...
    async def write(self, data: bytes) -> None: ...
    async def close(self) -> None: ...


# ---------------------------------------------------------------------------
# AsyncYamuxStream
# ---------------------------------------------------------------------------


class AsyncYamuxStream:
    """A single multiplexed bidirectional byte stream.

    Created by :meth:`AsyncYamuxSession.open_stream` or received via
    :meth:`AsyncYamuxSession.accept_stream`.
    """

    def __init__(self, stream_id: int, session: AsyncYamuxSession) -> None:
        self._id = stream_id
        self._session = session

        # Receive side
        self._recv_buf = bytearray()
        self._recv_event = asyncio.Event()
        self._recv_closed = False
        self._recv_error = False
        self._recv_window = _INITIAL_WINDOW_SIZE

        # Send side
        self._send_window = _INITIAL_WINDOW_SIZE
        self._send_event = asyncio.Event()
        self._send_event.set()  # Initially there is send budget
        self._send_closed = False

    @property
    def stream_id(self) -> int:
        return self._id

    async def read(self, n: int) -> bytes:
        """Read up to *n* bytes.  Returns ``b""`` on EOF, raises on RST."""
        while True:
            if self._recv_buf:
                size = min(n, len(self._recv_buf))
                data = bytes(self._recv_buf[:size])
                del self._recv_buf[:size]
                # Send window update if we've consumed enough
                consumed = _INITIAL_WINDOW_SIZE - self._recv_window
                if consumed >= _INITIAL_WINDOW_SIZE // 2:
                    delta = consumed
                    self._recv_window += delta
                    await self._session._send_window_update(self._id, delta)
                return data

            if self._recv_error:
                raise ConnectionResetError("yamux stream reset by peer")
            if self._recv_closed:
                return b""

            self._recv_event.clear()
            await self._recv_event.wait()

    async def read_exactly(self, n: int) -> bytes:
        """Read exactly *n* bytes.  Raises ``EOFError`` if stream ends early."""
        buf = bytearray()
        while len(buf) < n:
            chunk = await self.read(n - len(buf))
            if not chunk:
                raise EOFError(f"Expected {n} bytes, got {len(buf)}")
            buf.extend(chunk)
        return bytes(buf)

    async def write(self, data: bytes) -> None:
        """Write *data*, blocking if the send window is exhausted."""
        if self._send_closed:
            raise BrokenPipeError("yamux stream closed for writing")

        offset = 0
        mv = memoryview(data)

        while offset < len(data):
            # Wait for send budget
            while self._send_window == 0 and not self._send_closed:
                self._send_event.clear()
                await self._send_event.wait()

            if self._send_closed:
                raise BrokenPipeError("yamux stream closed for writing")

            chunk_size = min(len(data) - offset, self._send_window)
            self._send_window -= chunk_size
            chunk = bytes(mv[offset : offset + chunk_size])
            await self._session._send_data(self._id, chunk)
            offset += chunk_size

    async def close(self) -> None:
        """Close the stream (sends FIN)."""
        if not self._send_closed:
            self._send_closed = True
            with contextlib.suppress(Exception):
                await self._session._send_frame(_TYPE_DATA, _FLAG_FIN, self._id, 0)

        self._recv_closed = True
        self._recv_event.set()
        self._send_event.set()

    # -- Internal: called by AsyncYamuxSession._read_loop -------------------

    def _receive_data(self, data: bytes) -> None:
        self._recv_buf.extend(data)
        self._recv_window -= len(data)
        self._recv_event.set()

    def _receive_fin(self) -> None:
        self._recv_closed = True
        self._recv_event.set()

    def _receive_rst(self) -> None:
        self._recv_error = True
        self._recv_closed = True
        self._recv_event.set()
        self._send_closed = True
        self._send_event.set()

    def _update_send_window(self, delta: int) -> None:
        self._send_window += delta
        self._send_event.set()


# ---------------------------------------------------------------------------
# AsyncYamuxSession
# ---------------------------------------------------------------------------


class AsyncYamuxSession:
    """Async yamux session over a byte-stream connection.

    Parameters
    ----------
    conn:
        Underlying transport implementing async read/write/close.
    role:
        ``"initiator"`` uses odd stream IDs, ``"acceptor"`` uses even IDs.
        The session initiator is typically the side that opens the underlying
        transport (e.g., the WebSocket client).
    """

    def __init__(
        self,
        conn: AsyncReadWriteCloser,
        *,
        role: Literal["initiator", "acceptor"] = "initiator",
    ) -> None:
        self._conn = conn
        self._role = role
        self._streams: dict[int, AsyncYamuxStream] = {}
        self._next_stream_id = 1 if role == "initiator" else 2
        self._lock = asyncio.Lock()
        self._write_lock = asyncio.Lock()
        self._closed = False

        # Queue for streams opened by the remote side
        self._accept_queue: asyncio.Queue[AsyncYamuxStream] = asyncio.Queue()

    @property
    def is_closed(self) -> bool:
        return self._closed

    async def open_stream(self) -> AsyncYamuxStream:
        """Open a new outgoing multiplexed stream."""
        if self._closed:
            raise RuntimeError("yamux session is closed")

        async with self._lock:
            stream_id = self._next_stream_id
            self._next_stream_id += 2
            stream = AsyncYamuxStream(stream_id, self)
            self._streams[stream_id] = stream

        # Send SYN via a WINDOW_UPDATE frame (per spec)
        await self._send_frame(_TYPE_WINDOW_UPDATE, _FLAG_SYN, stream_id, 0)
        return stream

    async def accept_stream(self) -> AsyncYamuxStream:
        """Wait for and return the next incoming stream opened by the remote side."""
        return await self._accept_queue.get()

    async def run(self) -> None:
        """Main read loop — run as an ``asyncio.Task``.

        Reads frames from the connection and dispatches them to the
        appropriate stream.  Returns when the connection closes or a
        GO_AWAY is received.
        """
        keepalive_task = asyncio.create_task(self._keepalive_loop())
        try:
            await self._read_loop()
        finally:
            keepalive_task.cancel()
            if not self._closed:
                await self.close()

    async def close(self) -> None:
        """Close the session and all streams."""
        if self._closed:
            return
        self._closed = True

        with contextlib.suppress(Exception):
            await self._send_frame(_TYPE_GO_AWAY, 0, 0, 0)

        async with self._lock:
            for stream in self._streams.values():
                stream._receive_rst()

        with contextlib.suppress(Exception):
            await self._conn.close()

    # -- Frame I/O ----------------------------------------------------------

    async def _send_frame(self, msg_type: int, flags: int, stream_id: int, length: int) -> None:
        hdr = struct.pack(_HEADER_FMT, _VERSION, msg_type, flags, stream_id, length)
        async with self._write_lock:
            await self._conn.write(hdr)

    async def _send_data(self, stream_id: int, data: bytes) -> None:
        hdr = struct.pack(_HEADER_FMT, _VERSION, _TYPE_DATA, 0, stream_id, len(data))
        async with self._write_lock:
            await self._conn.write(hdr + data)

    async def _send_window_update(self, stream_id: int, delta: int) -> None:
        await self._send_frame(_TYPE_WINDOW_UPDATE, 0, stream_id, delta)

    # -- Read loop ----------------------------------------------------------

    async def _read_loop(self) -> None:
        try:
            while not self._closed:
                hdr_bytes = await self._read_exactly(_HEADER_SIZE)
                if len(hdr_bytes) < _HEADER_SIZE:
                    break

                _ver, msg_type, flags, stream_id, length = struct.unpack(_HEADER_FMT, hdr_bytes)

                if msg_type == _TYPE_DATA:
                    await self._handle_data(flags, stream_id, length)
                elif msg_type == _TYPE_WINDOW_UPDATE:
                    await self._handle_window_update(flags, stream_id, length)
                elif msg_type == _TYPE_PING:
                    await self._handle_ping(flags, length)
                elif msg_type == _TYPE_GO_AWAY:
                    break
        except (ConnectionError, EOFError, OSError):
            pass
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("yamux read loop error")
        finally:
            if not self._closed:
                self._closed = True
                async with self._lock:
                    for stream in self._streams.values():
                        stream._receive_rst()

    async def _read_exactly(self, n: int) -> bytes:
        """Read exactly *n* bytes from the transport."""
        buf = bytearray()
        while len(buf) < n:
            chunk = await self._conn.read(n - len(buf))
            if not chunk:
                return bytes(buf)
            buf.extend(chunk)
        return bytes(buf)

    async def _handle_data(self, flags: int, stream_id: int, length: int) -> None:
        payload = await self._read_exactly(length) if length > 0 else b""

        stream = await self._get_or_accept_stream(flags, stream_id)
        if stream is None:
            return

        if payload:
            stream._receive_data(payload)
        if flags & _FLAG_FIN:
            stream._receive_fin()
        if flags & _FLAG_RST:
            stream._receive_rst()

    async def _handle_window_update(self, flags: int, stream_id: int, length: int) -> None:
        stream = await self._get_or_accept_stream(flags, stream_id)
        if stream is None:
            return

        if length > 0:
            stream._update_send_window(length)
        if flags & _FLAG_FIN:
            stream._receive_fin()
        if flags & _FLAG_RST:
            stream._receive_rst()

    async def _handle_ping(self, flags: int, opaque: int) -> None:
        if flags & _FLAG_SYN:
            await self._send_frame(_TYPE_PING, _FLAG_ACK, 0, opaque)

    async def _get_or_accept_stream(self, flags: int, stream_id: int) -> AsyncYamuxStream | None:
        """Return an existing stream or create one if SYN is set."""
        async with self._lock:
            stream = self._streams.get(stream_id)
            if stream is not None:
                return stream

            if not (flags & _FLAG_SYN):
                # Unknown stream without SYN — ignore
                return None

            # Remote is opening a new stream — accept it
            stream = AsyncYamuxStream(stream_id, self)
            self._streams[stream_id] = stream

        # Send ACK
        await self._send_frame(_TYPE_WINDOW_UPDATE, _FLAG_ACK, stream_id, 0)
        # Enqueue for accept_stream()
        await self._accept_queue.put(stream)
        return stream

    # -- Keepalive ----------------------------------------------------------

    async def _keepalive_loop(self) -> None:
        ping_id = 0
        try:
            while not self._closed:
                await asyncio.sleep(_KEEPALIVE_INTERVAL)
                if self._closed:
                    break
                ping_id += 1
                await self._send_frame(_TYPE_PING, _FLAG_SYN, 0, ping_id)
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
