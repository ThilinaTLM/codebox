"""Tunnel connector: outbound WebSocket + yamux session.

Connects to the orchestrator's ``/ws/tunnel`` endpoint, establishes a
yamux session, and dispatches incoming streams to local services based
on the connect-header target port.
"""

# ruff: noqa: RUF006

from __future__ import annotations

import asyncio
import contextlib
import logging
import struct

import websockets
from codebox_tunnel import (
    CONNECT_HEADER_FMT,
    CONNECT_HEADER_SIZE,
    PROTOCOL_VERSION,
    STATUS_DIAL_FAILED,
    STATUS_OK,
    STATUS_UNSUPPORTED_VERSION,
    AsyncWSAdapter,
    AsyncYamuxSession,
    AsyncYamuxStream,
)

logger = logging.getLogger(__name__)

_RECONNECT_BASE_DELAY = 1.0
_RECONNECT_MAX_DELAY = 30.0
_BRIDGE_BUF_SIZE = 16384


async def run_tunnel(tunnel_url: str, callback_token: str) -> None:
    """Main tunnel loop with automatic reconnection.

    Connects to the orchestrator's WebSocket endpoint, sets up a yamux
    session (role=initiator), and accepts streams from the orchestrator.
    """
    delay = _RECONNECT_BASE_DELAY

    while True:
        try:
            logger.info("Tunnel connecting to %s", tunnel_url)
            async with websockets.connect(
                tunnel_url,
                additional_headers={"Authorization": f"Bearer {callback_token}"},
                ping_interval=30,
                ping_timeout=10,
                open_timeout=15,
                close_timeout=5,
                max_size=None,  # No message size limit
            ) as ws:
                logger.info("Tunnel WebSocket connected")
                delay = _RECONNECT_BASE_DELAY  # Reset backoff on success

                adapter = AsyncWSAdapter(ws)
                session = AsyncYamuxSession(adapter, role="initiator")

                # Run yamux read loop in background
                yamux_task = asyncio.create_task(session.run())

                try:
                    while not session.is_closed:
                        stream = await session.accept_stream()
                        asyncio.create_task(_dispatch_stream(stream))
                except Exception:
                    if not session.is_closed:
                        raise
                finally:
                    yamux_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await yamux_task
                    await session.close()

        except asyncio.CancelledError:
            logger.info("Tunnel connector shutting down")
            return
        except Exception:
            logger.warning("Tunnel disconnected, reconnecting in %.1fs", delay, exc_info=True)
            await asyncio.sleep(delay)
            delay = min(delay * 2, _RECONNECT_MAX_DELAY)


async def _dispatch_stream(stream: AsyncYamuxStream) -> None:
    """Read connect header and forward to the appropriate local port."""
    try:
        header = await stream.read_exactly(CONNECT_HEADER_SIZE)
        version, port = struct.unpack(CONNECT_HEADER_FMT, header)

        if version != PROTOCOL_VERSION:
            logger.warning("Tunnel: unsupported protocol version %d", version)
            await stream.write(bytes([STATUS_UNSUPPORTED_VERSION]))
            await stream.close()
            return

        # Try to connect to the local port
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
        except (ConnectionRefusedError, OSError) as exc:
            logger.debug("Tunnel: cannot dial localhost:%d — %s", port, exc)
            await stream.write(bytes([STATUS_DIAL_FAILED]))
            await stream.close()
            return

        # Connection succeeded — send OK and bridge
        await stream.write(bytes([STATUS_OK]))
        logger.debug("Tunnel: stream %d connected to localhost:%d", stream.stream_id, port)

        await _bridge(stream, reader, writer)

    except Exception:
        logger.debug("Tunnel: stream dispatch error", exc_info=True)
        with contextlib.suppress(Exception):
            await stream.close()


async def _bridge(
    stream: AsyncYamuxStream,
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
) -> None:
    """Bidirectional copy between a yamux stream and a local TCP connection."""

    async def _yamux_to_tcp() -> None:
        try:
            while True:
                data = await stream.read(_BRIDGE_BUF_SIZE)
                if not data:
                    break
                writer.write(data)
                await writer.drain()
        except Exception:  # noqa: S110
            pass
        finally:
            with contextlib.suppress(Exception):
                writer.close()
                await writer.wait_closed()

    async def _tcp_to_yamux() -> None:
        try:
            while True:
                data = await reader.read(_BRIDGE_BUF_SIZE)
                if not data:
                    break
                await stream.write(data)
        except Exception:  # noqa: S110
            pass
        finally:
            await stream.close()

    await asyncio.gather(_yamux_to_tcp(), _tcp_to_yamux())
