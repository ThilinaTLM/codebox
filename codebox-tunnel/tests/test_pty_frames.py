"""Tests for the PTY frame protocol used between the orchestrator bridge
and the sandbox PTY server."""

from __future__ import annotations

import asyncio
import os
import struct

import pytest
from codebox_tunnel.pty_frames import (
    FRAME_HEADER_SIZE,
    MAX_FRAME_PAYLOAD,
    PTYFrameType,
    read_frame,
    write_frame,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _stream_pair() -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    """Return a (reader, writer) pair connected by a socketpair, so tests
    can round-trip bytes without a real TCP server.
    """
    import socket

    s1, s2 = socket.socketpair()

    loop = asyncio.get_running_loop()

    # Reader side
    reader = asyncio.StreamReader()
    reader_protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_accepted_socket(lambda: reader_protocol, s1)

    # Writer side
    w_reader = asyncio.StreamReader()
    w_protocol = asyncio.StreamReaderProtocol(w_reader)
    w_transport, _ = await loop.connect_accepted_socket(lambda: w_protocol, s2)
    writer = asyncio.StreamWriter(w_transport, w_protocol, w_reader, loop)

    return reader, writer


# ---------------------------------------------------------------------------
# Round-trip tests
# ---------------------------------------------------------------------------


async def test_round_trip_empty_payload() -> None:
    reader, writer = await _stream_pair()
    try:
        await write_frame(writer, PTYFrameType.OPEN, b"")
        ftype, payload = await read_frame(reader)
        assert ftype == PTYFrameType.OPEN
        assert payload == b""
    finally:
        writer.close()


async def test_round_trip_stdin_bytes() -> None:
    reader, writer = await _stream_pair()
    try:
        data = b"echo hello\n"
        await write_frame(writer, PTYFrameType.STDIN, data)
        ftype, payload = await read_frame(reader)
        assert ftype == PTYFrameType.STDIN
        assert payload == data
    finally:
        writer.close()


async def test_round_trip_large_random_payload() -> None:
    reader, writer = await _stream_pair()
    try:
        chunk = os.urandom(256 * 1024)  # 256 KiB — well under the 1 MiB cap
        await write_frame(writer, PTYFrameType.STDOUT, chunk)
        ftype, payload = await read_frame(reader)
        assert ftype == PTYFrameType.STDOUT
        assert payload == chunk
    finally:
        writer.close()


async def test_round_trip_multiple_frames_interleaved() -> None:
    reader, writer = await _stream_pair()
    try:
        await write_frame(writer, PTYFrameType.STDIN, b"a")
        await write_frame(writer, PTYFrameType.RESIZE, b'{"cols":80,"rows":24}')
        await write_frame(writer, PTYFrameType.STDIN, b"b")

        t1, p1 = await read_frame(reader)
        t2, p2 = await read_frame(reader)
        t3, p3 = await read_frame(reader)

        assert (t1, p1) == (PTYFrameType.STDIN, b"a")
        assert (t2, p2) == (PTYFrameType.RESIZE, b'{"cols":80,"rows":24}')
        assert (t3, p3) == (PTYFrameType.STDIN, b"b")
    finally:
        writer.close()


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


async def test_write_frame_rejects_oversize_payload() -> None:
    _reader, writer = await _stream_pair()
    try:
        too_big = b"x" * (MAX_FRAME_PAYLOAD + 1)
        with pytest.raises(ValueError):
            await write_frame(writer, PTYFrameType.STDOUT, too_big)
    finally:
        writer.close()


async def test_read_frame_rejects_oversize_header_length() -> None:
    reader, writer = await _stream_pair()
    try:
        # Hand-craft a header claiming a length beyond the cap.
        bogus = struct.pack(">BI", PTYFrameType.STDOUT, MAX_FRAME_PAYLOAD + 1)
        writer.write(bogus)
        await writer.drain()
        with pytest.raises(ValueError):
            await read_frame(reader)
    finally:
        writer.close()


async def test_read_frame_raises_on_eof() -> None:
    reader, writer = await _stream_pair()
    writer.close()
    await writer.wait_closed()
    with pytest.raises(asyncio.IncompleteReadError):
        await read_frame(reader)


# ---------------------------------------------------------------------------
# Header format sanity
# ---------------------------------------------------------------------------


def test_frame_header_size_is_five_bytes() -> None:
    # 1 byte type + 4 byte length = 5; guards against accidental struct
    # format drift.
    assert FRAME_HEADER_SIZE == 5


# ---------------------------------------------------------------------------
# Duck-typed compatibility with AsyncYamuxStream
# ---------------------------------------------------------------------------


class _FakeYamuxStream:
    """Duck-typed stand-in for ``AsyncYamuxStream``.

    Matches the shape we depend on:

    * ``async def write(data: bytes) -> None`` (no ``drain``)
    * ``async def read_exactly(n: int) -> bytes``
    """

    def __init__(self) -> None:
        self._buf = bytearray()
        self._event = asyncio.Event()

    async def write(self, data: bytes) -> None:
        self._buf.extend(data)
        self._event.set()

    async def read_exactly(self, n: int) -> bytes:
        while len(self._buf) < n:
            self._event.clear()
            await self._event.wait()
        out = bytes(self._buf[:n])
        del self._buf[:n]
        return out


async def test_write_frame_works_with_async_write_stream() -> None:
    """``write_frame`` must work with streams whose ``write`` is a coroutine
    and which have no ``drain`` method (the yamux stream shape)."""
    stream = _FakeYamuxStream()
    await write_frame(stream, PTYFrameType.OPEN, b'{"cols":80,"rows":24}')
    ftype, payload = await read_frame(stream)
    assert ftype == PTYFrameType.OPEN
    assert payload == b'{"cols":80,"rows":24}'


async def test_read_frame_accepts_read_exactly_method_name() -> None:
    """``read_frame`` must accept the ``read_exactly`` spelling used by
    ``AsyncYamuxStream`` (``asyncio.StreamReader`` uses ``readexactly``)."""
    stream = _FakeYamuxStream()
    # Hand-write a frame directly into the buffer.
    payload = b"hello"
    stream._buf.extend(struct.pack(">BI", PTYFrameType.STDIN, len(payload)) + payload)
    stream._event.set()
    ftype, got = await read_frame(stream)
    assert ftype == PTYFrameType.STDIN
    assert got == payload
