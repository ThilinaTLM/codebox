"""Server-Sent Events endpoints for real-time streaming.

Per-box stream replays persisted events then streams live updates.
Global stream pushes box lifecycle events to all connected clients.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from codebox_orchestrator.services.box_service import BoxService
    from codebox_orchestrator.services.global_broadcast_service import GlobalBroadcastService
    from codebox_orchestrator.services.relay_service import RelayService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

HEARTBEAT_INTERVAL = 30.0  # seconds


def _sse_line(data: dict[str, Any]) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


async def _box_event_generator(
    box_id: str,
    box_service: BoxService,
    relay: RelayService,
) -> AsyncGenerator[str, None]:
    """Replay persisted events, then stream live events for a box."""
    # Replay persisted events from DB
    try:
        events = await box_service.get_box_events(box_id)
        for event in events:
            data = event.data
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except (json.JSONDecodeError, TypeError):
                    data = {"type": event.event_type, "raw": data}
            if isinstance(data, dict):
                yield _sse_line(data)
    except Exception as exc:
        logger.warning("Failed to replay events for box %s: %s", box_id, exc)

    # Subscribe to live events
    queue = relay.subscribe(box_id)
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
            except TimeoutError:
                # SSE comment as heartbeat to keep connection alive
                yield ":\n\n"
                continue
            yield _sse_line(event)
    except asyncio.CancelledError:
        pass
    finally:
        relay.unsubscribe(box_id, queue)


async def _global_event_generator(
    global_broadcast: GlobalBroadcastService,
) -> AsyncGenerator[str, None]:
    """Stream global box lifecycle events."""
    queue = global_broadcast.subscribe()
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
            except TimeoutError:
                yield ":\n\n"
                continue
            yield _sse_line(event)
    except asyncio.CancelledError:
        pass
    finally:
        global_broadcast.unsubscribe(queue)


@router.get("/boxes/{box_id}/stream")
async def box_stream(request: Request, box_id: str) -> StreamingResponse:
    """SSE stream for a box — replays persisted events then streams live updates."""
    box_service: BoxService = request.app.state.box_service
    relay: RelayService = request.app.state.relay_service

    # Verify box exists
    box = await box_service.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")

    return StreamingResponse(
        _box_event_generator(box_id, box_service, relay),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/stream")
async def global_stream(request: Request) -> StreamingResponse:
    """SSE stream for platform-level box lifecycle events."""
    global_broadcast: GlobalBroadcastService = request.app.state.global_broadcast

    return StreamingResponse(
        _global_event_generator(global_broadcast),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
