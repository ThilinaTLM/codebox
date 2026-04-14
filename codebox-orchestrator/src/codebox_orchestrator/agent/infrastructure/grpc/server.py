"""Thin gRPC adapter for box <-> orchestrator communication.

Handles authentication, stream lifecycle, and event dispatch.
Delegates all business logic to application-layer handlers.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import TYPE_CHECKING

import grpc
from grpc import aio as grpc_aio

from codebox_orchestrator.agent.infrastructure.callback_registry import (
    CallbackRegistry,
    ConnectionHandle,
)
from codebox_orchestrator.agent.infrastructure.callback_token import decode_callback_token
from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import (
    box_pb2,
    box_pb2_grpc,
)

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from codebox_orchestrator.agent.application.commands.handle_sandbox_event import (
        HandleBoxEventHandler,
    )

logger = logging.getLogger(__name__)

_HEARTBEAT_INTERVAL_S = 20  # Send a heartbeat if no data sent for this long


class BoxServiceServicer(box_pb2_grpc.BoxServiceServicer):
    def __init__(
        self,
        event_handler: HandleBoxEventHandler,
        registry: CallbackRegistry,
    ) -> None:
        self._event_handler = event_handler
        self._registry = registry

    async def Connect(  # noqa: N802, PLR0912, PLR0915
        self,
        request_iterator: AsyncIterator[box_pb2.BoxEvent],
        context: grpc_aio.ServicerContext,
    ) -> AsyncIterator[box_pb2.BoxCommand]:
        # Auth -- extract and verify JWT token from metadata
        metadata = dict(context.invocation_metadata())
        auth_header = metadata.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Missing auth token")
            return
        token = auth_header[len("Bearer ") :]
        result = decode_callback_token(token)
        if result is None:
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid callback token")
            return
        entity_id, entity_type = result

        logger.info("gRPC connection from %s %s", entity_type, entity_id)

        # Replace stale connection
        old_conn = self._registry.get_connection(entity_id)
        if old_conn is not None:
            logger.info("Replacing stale connection for %s", entity_id)
            self._registry.remove(entity_id)
        self._registry.init_connection_state(entity_id)

        # Wait for RegisterEvent
        try:
            first_event = await request_iterator.__anext__()
        except (StopAsyncIteration, grpc_aio.AioRpcError):
            logger.warning("Box %s disconnected during registration", entity_id)
            return
        if not first_event.HasField("register"):
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "Expected RegisterEvent")
            return

        # Register connection
        handle = ConnectionHandle()
        self._registry.set_connection(entity_id, handle)

        logger.info("Box %s registered via gRPC", entity_id)

        # Send RegisteredAck
        yield box_pb2.BoxCommand(registered=box_pb2.RegisteredAck())

        # Concurrent event reader + command writer
        event_reader_task = asyncio.create_task(self._read_events(request_iterator, entity_id))
        try:
            last_send = time.monotonic()
            while not context.cancelled():
                if event_reader_task.done():
                    # Drain remaining commands
                    while not handle.command_queue.empty():
                        yield handle.command_queue.get_nowait()
                    break
                try:
                    cmd = await asyncio.wait_for(handle.command_queue.get(), timeout=0.5)
                    yield cmd
                    last_send = time.monotonic()
                except TimeoutError:
                    if time.monotonic() - last_send >= _HEARTBEAT_INTERVAL_S:
                        yield box_pb2.BoxCommand(heartbeat=box_pb2.Heartbeat())
                        last_send = time.monotonic()
                    continue
        except asyncio.CancelledError:
            pass
        finally:
            if not event_reader_task.done():
                event_reader_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await event_reader_task
            self._registry.remove(entity_id)
            await self._event_handler.set_container_stopped(entity_id, "container_error")
            logger.info("gRPC connection closed for box %s", entity_id)

    async def _read_events(self, request_iterator: AsyncIterator, box_id: str) -> None:
        try:
            async for event in request_iterator:
                # Delegate ALL business logic to the handler — pass protobuf directly
                await self._event_handler.execute(box_id, event)
        except grpc_aio.AioRpcError:
            logger.info("Box %s gRPC stream ended", box_id)
        except Exception:
            logger.exception("Error reading events from box %s", box_id)


async def start_grpc_server(
    port: int,
    event_handler: HandleBoxEventHandler,
    registry: CallbackRegistry,
) -> grpc_aio.Server:
    """Create and start the gRPC server."""
    # Keepalive settings allow the server to send pings and accept client
    # pings so that reverse-proxy idle timeouts don't kill the connection.
    server = grpc_aio.server(
        options=[
            ("grpc.keepalive_time_ms", 30_000),
            ("grpc.keepalive_timeout_ms", 10_000),
            ("grpc.keepalive_permit_without_calls", True),
            ("grpc.http2.max_pings_without_data", 0),
            ("grpc.http2.min_recv_ping_interval_without_data_ms", 10_000),
        ]
    )
    servicer = BoxServiceServicer(
        event_handler=event_handler,
        registry=registry,
    )
    box_pb2_grpc.add_BoxServiceServicer_to_server(servicer, server)

    tls = _load_tls_credentials()
    if tls:
        server.add_secure_port(f"[::]:{port}", tls)
        logger.info("gRPC server listening on port %d with TLS", port)
    else:
        server.add_insecure_port(f"[::]:{port}")
        logger.warning("gRPC server listening on port %d WITHOUT TLS (insecure)", port)

    await server.start()
    return server


def _load_tls_credentials() -> grpc.ServerCredentials | None:
    """Load TLS cert/key from config paths, or return *None* for insecure mode."""
    from codebox_orchestrator.config import GRPC_TLS_CERT, GRPC_TLS_KEY  # noqa: PLC0415

    if not (GRPC_TLS_CERT and GRPC_TLS_KEY):
        return None
    from pathlib import Path  # noqa: PLC0415

    cert_data = Path(GRPC_TLS_CERT).read_bytes()
    key_data = Path(GRPC_TLS_KEY).read_bytes()
    return grpc.ssl_server_credentials([(key_data, cert_data)])
