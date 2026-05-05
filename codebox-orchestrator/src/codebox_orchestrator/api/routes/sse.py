"""Server-Sent Events endpoints for real-time streaming.

Per-box stream replays canonical persisted events, then switches to live streaming.
Global stream pushes project-scoped lifecycle events to authorized clients.
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
    get_project_service,
    get_query_service,
    get_relay,
)
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.project.service import ProjectService
    from codebox_orchestrator.shared.messaging.global_broadcast import GlobalBroadcastService
    from codebox_orchestrator.shared.messaging.relay import RelayService

logger = logging.getLogger(__name__)

router = APIRouter()

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


async def _can_receive_global_event(
    event: dict[str, Any],
    user: UserInfo,
    project_service: ProjectService,
) -> bool:
    """Return whether *user* is allowed to receive a global lifecycle event."""
    if user.user_type == "admin":
        return True

    project_id = event.get("project_id")
    if not isinstance(project_id, str) or not project_id:
        logger.warning(
            "Dropping unscoped global event for non-admin user %s: %s",
            user.user_id,
            event.get("type"),
        )
        return False

    return await project_service.has_member(project_id, user.user_id)


async def _global_event_generator(
    global_broadcast: GlobalBroadcastService,
    user: UserInfo,
    project_service: ProjectService,
) -> AsyncGenerator[str, None]:
    """Stream global lifecycle events, filtered by project membership."""
    queue = global_broadcast.subscribe()
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
            except TimeoutError:
                yield ":\n\n"
                continue
            if not await _can_receive_global_event(event, user, project_service):
                continue
            yield _sse_line(event)
    except asyncio.CancelledError:
        pass
    finally:
        global_broadcast.unsubscribe(queue)


@router.get("/api/projects/{slug}/boxes/{box_id}/stream")
async def box_stream(
    box_id: str,
    request: Request,
    after_seq: int | None = None,
    ctx: ProjectContext = Depends(get_project_context),
    query: BoxQueryService = Depends(get_query_service),
    relay: RelayService = Depends(get_relay),
) -> StreamingResponse:
    """SSE stream for a box with replay by sequence."""
    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
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


@router.get("/api/stream")
async def global_stream(
    global_broadcast: GlobalBroadcastService = Depends(get_global_broadcast),
    user: UserInfo = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
) -> StreamingResponse:
    """SSE stream for project-scoped lifecycle events."""
    return StreamingResponse(
        _global_event_generator(global_broadcast, user, project_service),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
