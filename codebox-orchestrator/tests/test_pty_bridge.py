"""Unit tests for the PTY WebSocket bridge translation layer.

These cover the uplink/downlink frame translation in isolation.  End-to-
end tests would require spinning up the full FastAPI app + a fake
tunnel registry; for the bridge helpers themselves, a fake WebSocket
and a pipe-backed "stream" are enough to verify the mapping is
correct.
"""

from __future__ import annotations

import asyncio
import json
import socket

from codebox_tunnel.pty_frames import PTYFrameType, read_frame, write_frame

from codebox_orchestrator.api.routes.pty import (
    _downlink,
    _handle_control_frame,
    _uplink,
)

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class FakeWebSocket:
    """Minimal stand-in for ``starlette.websockets.WebSocket`` used by the
    bridge helpers.  Records send_bytes / send_text calls and feeds
    queued incoming messages out of ``receive``."""

    def __init__(self) -> None:
        self.incoming: asyncio.Queue[dict] = asyncio.Queue()
        self.sent_bytes: list[bytes] = []
        self.sent_text: list[str] = []
        self.closed = False

    async def receive(self) -> dict:
        return await self.incoming.get()

    async def send_bytes(self, data: bytes) -> None:
        if self.closed:
            raise RuntimeError("closed")
        self.sent_bytes.append(bytes(data))

    async def send_text(self, text: str) -> None:
        if self.closed:
            raise RuntimeError("closed")
        self.sent_text.append(text)


async def _stream_pair() -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    """Return (reader, writer) connected via a socketpair so read/write on
    one side pops up on the other."""
    s1, s2 = socket.socketpair()
    loop = asyncio.get_running_loop()

    # reader side (s1)
    reader = asyncio.StreamReader()
    await loop.connect_accepted_socket(lambda: asyncio.StreamReaderProtocol(reader), s1)

    # writer side (s2)
    w_reader = asyncio.StreamReader()
    w_proto = asyncio.StreamReaderProtocol(w_reader)
    w_transport, _ = await loop.connect_accepted_socket(lambda: w_proto, s2)
    writer = asyncio.StreamWriter(w_transport, w_proto, w_reader, loop)
    return reader, writer


# ---------------------------------------------------------------------------
# _handle_control_frame
# ---------------------------------------------------------------------------


async def test_control_open_writes_open_frame() -> None:
    reader, writer = await _stream_pair()
    try:
        ok = await _handle_control_frame(
            {"type": "open", "cols": 120, "rows": 30, "shell": "/bin/bash", "cwd": "/workspace"},
            writer,  # type: ignore[arg-type]
        )
        assert ok is True
        ftype, payload = await read_frame(reader)
        assert ftype == PTYFrameType.OPEN
        parsed = json.loads(payload)
        assert parsed == {
            "cols": 120,
            "rows": 30,
            "shell": "/bin/bash",
            "cwd": "/workspace",
        }
    finally:
        writer.close()


async def test_control_resize_writes_resize_frame() -> None:
    reader, writer = await _stream_pair()
    try:
        ok = await _handle_control_frame(
            {"type": "resize", "cols": 200, "rows": 60},
            writer,  # type: ignore[arg-type]
        )
        assert ok is True
        ftype, payload = await read_frame(reader)
        assert ftype == PTYFrameType.RESIZE
        assert json.loads(payload) == {"cols": 200, "rows": 60}
    finally:
        writer.close()


async def test_control_unknown_kind_is_ignored() -> None:
    _reader, writer = await _stream_pair()
    try:
        ok = await _handle_control_frame({"type": "foo"}, writer)  # type: ignore[arg-type]
        assert ok is True  # Not an error — just ignored.
    finally:
        writer.close()


# ---------------------------------------------------------------------------
# _uplink
# ---------------------------------------------------------------------------


async def test_uplink_translates_binary_to_stdin() -> None:
    reader, writer = await _stream_pair()
    ws = FakeWebSocket()

    task = asyncio.create_task(_uplink(ws, writer))  # type: ignore[arg-type]
    try:
        await ws.incoming.put({"type": "websocket.receive", "bytes": b"hello", "text": None})
        ftype, payload = await asyncio.wait_for(read_frame(reader), timeout=2.0)
        assert ftype == PTYFrameType.STDIN
        assert payload == b"hello"

        # Disconnect cleanly.
        await ws.incoming.put({"type": "websocket.disconnect"})
        await asyncio.wait_for(task, timeout=2.0)
    finally:
        writer.close()
        if not task.done():
            task.cancel()


async def test_uplink_translates_text_control_messages() -> None:
    reader, writer = await _stream_pair()
    ws = FakeWebSocket()

    task = asyncio.create_task(_uplink(ws, writer))  # type: ignore[arg-type]
    try:
        await ws.incoming.put(
            {
                "type": "websocket.receive",
                "text": json.dumps({"type": "resize", "cols": 80, "rows": 24}),
                "bytes": None,
            }
        )
        ftype, payload = await asyncio.wait_for(read_frame(reader), timeout=2.0)
        assert ftype == PTYFrameType.RESIZE
        assert json.loads(payload) == {"cols": 80, "rows": 24}

        await ws.incoming.put({"type": "websocket.disconnect"})
        await asyncio.wait_for(task, timeout=2.0)
    finally:
        writer.close()
        if not task.done():
            task.cancel()


async def test_uplink_ignores_malformed_json() -> None:
    _reader, writer = await _stream_pair()
    ws = FakeWebSocket()

    task = asyncio.create_task(_uplink(ws, writer))  # type: ignore[arg-type]
    try:
        await ws.incoming.put({"type": "websocket.receive", "text": "not-json", "bytes": None})
        # Give the loop a chance to process then disconnect.
        await asyncio.sleep(0.05)
        await ws.incoming.put({"type": "websocket.disconnect"})
        await asyncio.wait_for(task, timeout=2.0)
    finally:
        writer.close()
        if not task.done():
            task.cancel()


# ---------------------------------------------------------------------------
# _downlink
# ---------------------------------------------------------------------------


async def test_downlink_forwards_stdout_as_binary() -> None:
    reader, writer = await _stream_pair()
    ws = FakeWebSocket()

    task = asyncio.create_task(_downlink(ws, reader))  # type: ignore[arg-type]
    try:
        await write_frame(writer, PTYFrameType.STDOUT, b"terminal output")
        await write_frame(
            writer, PTYFrameType.EXIT, json.dumps({"exit_code": 0, "signal": None}).encode()
        )
        await asyncio.wait_for(task, timeout=2.0)
    finally:
        writer.close()
        if not task.done():
            task.cancel()

    assert ws.sent_bytes == [b"terminal output"]
    assert len(ws.sent_text) == 1
    exit_msg = json.loads(ws.sent_text[0])
    assert exit_msg == {"type": "exit", "exit_code": 0, "signal": None}


async def test_downlink_handles_malformed_exit_payload() -> None:
    reader, writer = await _stream_pair()
    ws = FakeWebSocket()

    task = asyncio.create_task(_downlink(ws, reader))  # type: ignore[arg-type]
    try:
        await write_frame(writer, PTYFrameType.EXIT, b"not-json")
        await asyncio.wait_for(task, timeout=2.0)
    finally:
        writer.close()
        if not task.done():
            task.cancel()

    # Exit message should still be sent with a fallback shape.
    assert len(ws.sent_text) == 1
    parsed = json.loads(ws.sent_text[0])
    assert parsed["type"] == "exit"
    assert parsed["exit_code"] == -1


async def test_downlink_returns_on_stream_close() -> None:
    reader, writer = await _stream_pair()
    ws = FakeWebSocket()

    task = asyncio.create_task(_downlink(ws, reader))  # type: ignore[arg-type]
    writer.close()
    await asyncio.wait_for(task, timeout=2.0)
    # No EXIT was sent by the peer, so no text messages were produced.
    assert ws.sent_text == []
