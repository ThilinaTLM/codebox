"""Tunnel registry — maps box IDs to active yamux sessions.

Analogous to ``CallbackRegistry`` for gRPC connections, but manages the
WebSocket-based yamux tunnel used for file operations and port forwarding.
"""

# ruff: noqa: RUF006 ASYNC109 TRY301

from __future__ import annotations

import asyncio
import logging
import struct

from codebox_tunnel import (
    CONNECT_HEADER_FMT,
    PROTOCOL_VERSION,
    STATUS_DIAL_FAILED,
    STATUS_OK,
    STATUS_PORT_NOT_ALLOWED,
    STATUS_UNSUPPORTED_VERSION,
    AsyncYamuxSession,
    AsyncYamuxStream,
)

logger = logging.getLogger(__name__)


class NoTunnelConnectionError(Exception):
    """Raised when no tunnel session exists for the requested box."""

    def __init__(self, box_id: str) -> None:
        super().__init__(f"No tunnel connection for box {box_id}")
        self.box_id = box_id


class TunnelDialError(Exception):
    """Raised when the sandbox refuses or cannot dial the target port."""

    _STATUS_MESSAGES: dict[int, str] = {  # noqa: RUF012
        STATUS_PORT_NOT_ALLOWED: "port not allowed",
        STATUS_DIAL_FAILED: "dial failed (nothing listening?)",
        STATUS_UNSUPPORTED_VERSION: "unsupported protocol version",
    }

    def __init__(self, box_id: str, port: int, status: int) -> None:
        msg = self._STATUS_MESSAGES.get(status, f"unknown status {status:#x}")
        super().__init__(f"Tunnel dial to {box_id}:{port} failed: {msg}")
        self.box_id = box_id
        self.port = port
        self.status = status


class TunnelRegistry:
    """Maps box_id → active yamux session for tunnel connections."""

    def __init__(self) -> None:
        self._sessions: dict[str, AsyncYamuxSession] = {}
        self._connected_events: dict[str, asyncio.Event] = {}

    def register(self, box_id: str, session: AsyncYamuxSession) -> None:
        """Register a yamux session for a box."""
        old = self._sessions.pop(box_id, None)
        if old and not old.is_closed:
            logger.info("Replacing stale tunnel session for %s", box_id)
            _bg = asyncio.create_task(old.close())
        self._sessions[box_id] = session
        event = self._connected_events.get(box_id)
        if event:
            event.set()
        logger.info("Tunnel registered for box %s", box_id)

    def remove(self, box_id: str) -> None:
        """Remove a tunnel session."""
        session = self._sessions.pop(box_id, None)
        self._connected_events.pop(box_id, None)
        if session and not session.is_closed:
            _bg = asyncio.create_task(session.close())
        logger.info("Tunnel removed for box %s", box_id)

    def get_session(self, box_id: str) -> AsyncYamuxSession | None:
        """Return the active yamux session for a box, or ``None``."""
        session = self._sessions.get(box_id)
        if session and session.is_closed:
            self._sessions.pop(box_id, None)
            return None
        return session

    def is_connected(self, box_id: str) -> bool:
        """Check whether a tunnel session exists and is open."""
        return self.get_session(box_id) is not None

    async def open_stream(
        self, box_id: str, target_port: int, *, timeout: float = 10.0
    ) -> AsyncYamuxStream:
        """Open a yamux stream to a specific port inside the sandbox.

        Performs the connect-header handshake:
        1. Open a new yamux stream
        2. Write ``[version | target_port]``
        3. Read 1-byte status reply
        4. Return the connected stream (or raise on failure)
        """
        session = self.get_session(box_id)
        if session is None:
            raise NoTunnelConnectionError(box_id)

        stream = await session.open_stream()
        try:
            await stream.write(struct.pack(CONNECT_HEADER_FMT, PROTOCOL_VERSION, target_port))
            status_bytes = await asyncio.wait_for(stream.read_exactly(1), timeout=timeout)
            status = status_bytes[0]
            if status != STATUS_OK:
                await stream.close()
                raise TunnelDialError(box_id, target_port, status)
        except (TunnelDialError, NoTunnelConnectionError):
            raise
        except Exception as exc:
            await stream.close()
            raise TunnelDialError(box_id, target_port, STATUS_DIAL_FAILED) from exc
        return stream

    async def wait_for_connection(self, box_id: str, timeout: float = 60.0) -> bool:
        """Wait until a tunnel session is registered for the box."""
        if self.get_session(box_id) is not None:
            return True
        event = self._connected_events.setdefault(box_id, asyncio.Event())
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except TimeoutError:
            return False
        return True
