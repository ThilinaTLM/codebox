"""Server-Sent Events endpoints for real-time streaming.

Per-box stream pushes live events for the current in-progress turn.
Global stream pushes box lifecycle events to all connected clients.
History is served via GET /api/boxes/{box_id}/messages (REST).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from codebox_orchestrator.api.dependencies import (
    get_get_box,
    get_global_broadcast,
    get_relay,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from codebox_orchestrator.box.application.queries.get_box import GetBoxHandler
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
    relay: RelayService,
) -> AsyncGenerator[str, None]:
    """Stream live events for a box (no replay — history comes from REST)."""
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
async def box_stream(
    box_id: str,
    get_box_handler: GetBoxHandler = Depends(get_get_box),
    relay: RelayService = Depends(get_relay),
) -> StreamingResponse:
    """SSE stream for a box — live events only."""
    box = await get_box_handler.execute(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")

    return StreamingResponse(
        _box_event_generator(box_id, relay),
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
