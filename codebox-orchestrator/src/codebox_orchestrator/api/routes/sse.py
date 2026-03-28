"""Server-Sent Events endpoints for real-time streaming (DDD version).

Per-box stream replays persisted events then streams live updates.
Global stream pushes box lifecycle events to all connected clients.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from codebox_orchestrator.api.dependencies import (
    get_box_events,
    get_get_box,
    get_global_broadcast,
    get_relay,
)
from codebox_orchestrator.box.application.queries.get_box import GetBoxHandler
from codebox_orchestrator.box.application.queries.get_box_events import GetBoxEventsHandler
from codebox_orchestrator.shared.messaging.global_broadcast import GlobalBroadcastService
from codebox_orchestrator.shared.messaging.relay import RelayService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

HEARTBEAT_INTERVAL = 30.0  # seconds


def _sse_line(data: dict[str, Any]) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data)}\n\n"


async def _box_event_generator(
    box_id: str,
    events_handler: GetBoxEventsHandler,
    relay: RelayService,
) -> AsyncGenerator[str, None]:
    """Replay persisted events, then stream live events for a box."""
    # Replay persisted events from DB
    try:
        events = await events_handler.execute(box_id)
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
            except asyncio.TimeoutError:
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
            except asyncio.TimeoutError:
                yield ":\n\n"
                continue
            yield _sse_line(event)
    except asyncio.CancelledError:
        pass
    finally:
        global_broadcast.unsubscribe(queue)


@router.get("/boxes/{box_id}/stream")
async def box_stream(
    box_id: str,
    get_box_handler: GetBoxHandler = Depends(get_get_box),
    events_handler: GetBoxEventsHandler = Depends(get_box_events),
    relay: RelayService = Depends(get_relay),
) -> StreamingResponse:
    """SSE stream for a box — replays persisted events then streams live updates."""
    # Verify box exists
    box = await get_box_handler.execute(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")

    return StreamingResponse(
        _box_event_generator(box_id, events_handler, relay),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/stream")
async def global_stream(
    global_broadcast: GlobalBroadcastService = Depends(get_global_broadcast),
) -> StreamingResponse:
    """SSE stream for platform-level box lifecycle events."""
    return StreamingResponse(
        _global_event_generator(global_broadcast),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
