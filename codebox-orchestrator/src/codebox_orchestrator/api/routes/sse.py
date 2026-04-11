"""Server-Sent Events endpoints for real-time streaming.

Per-box stream replays canonical persisted events, then switches to live streaming.
Global stream pushes box lifecycle events to all connected clients.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from codebox_orchestrator.api.dependencies import (
    get_global_broadcast,
    get_query_service,
    get_relay,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.shared.messaging.global_broadcast import GlobalBroadcastService
    from codebox_orchestrator.shared.messaging.relay import RelayService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

HEARTBEAT_INTERVAL = 30.0  # seconds


def _sse_line(data: dict[str, Any]) -> str:
    """Format a dict as an SSE data line."""
    event_id = data.get("seq")
    prefix = f"id: {event_id}\n" if event_id is not None else ""
    return prefix + f"data: {json.dumps(data)}\n\n"


async def _box_event_generator(
    box_id: str,
    relay: RelayService,
    query: BoxQueryService,
    after_seq: int,
) -> AsyncGenerator[str, None]:
    """Replay persisted events, then continue with live events."""
    queue = relay.subscribe(box_id)
    replay_max_seq = after_seq
    try:
        history = await query.list_events(box_id, after_seq=after_seq)
        for event in history:
            replay_max_seq = max(replay_max_seq, int(event.get("seq", 0) or 0))
            yield _sse_line(event)

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
            except TimeoutError:
                yield ":\n\n"
                continue
            seq = int(event.get("seq", 0) or 0)
            if seq <= replay_max_seq:
                continue
            replay_max_seq = max(replay_max_seq, seq)
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
    request: Request,
    after_seq: int | None = None,
    query: BoxQueryService = Depends(get_query_service),
    relay: RelayService = Depends(get_relay),
) -> StreamingResponse:
    """SSE stream for a box with replay by sequence."""
    box = query.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")

    last_event_id = request.headers.get("Last-Event-ID", "")
    if after_seq is not None:
        cursor = after_seq
    else:
        try:
            cursor = int(last_event_id or 0)
        except ValueError:
            cursor = 0

    return StreamingResponse(
        _box_event_generator(box_id, relay, query, cursor),
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
