"""Internal WebSocket endpoint that sandbox containers connect to.

Containers initiate the connection back to this endpoint after startup,
reversing the traditional orchestrator→container direction.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from codebox_orchestrator.db.models import Box, BoxEvent, BoxStatus
from codebox_orchestrator.services.callback_registry import CallbackRegistry
from codebox_orchestrator.services.global_broadcast_service import GlobalBroadcastService
from codebox_orchestrator.services.relay_service import RelayService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/api/internal/sandbox/connect")
async def sandbox_callback(ws: WebSocket) -> None:
    """Accept inbound WebSocket from a container."""
    token = ws.query_params.get("token", "")

    registry: CallbackRegistry = ws.app.state.callback_registry
    relay: RelayService = ws.app.state.relay_service

    # Validate callback token
    result = registry.resolve(token)
    if result is None:
        await ws.close(code=4001, reason="Invalid callback token")
        return

    entity_id, entity_type = result
    await ws.accept()
    logger.info("Callback accepted for %s %s", entity_type, entity_id)

    # Close existing stale connection if any (container reconnected)
    old_ws = registry.get_connection(entity_id)
    if old_ws is not None:
        logger.info("Replacing stale connection for %s %s", entity_type, entity_id)
        try:
            await old_ws.close(code=1012, reason="Replaced by reconnection")
        except Exception:
            pass
        registry.remove(entity_id)

    # Re-create connected/prompt_ready events for this connection
    registry._connected_events[entity_id] = asyncio.Event()
    registry._prompt_ready_events[entity_id] = asyncio.Event()

    # Wait for register message
    try:
        raw = await ws.receive_text()
        reg_msg = json.loads(raw)
    except (WebSocketDisconnect, Exception) as exc:
        logger.warning("Box %s disconnected during registration: %s", entity_id, exc)
        return

    if reg_msg.get("type") != "register":
        await ws.close(code=4002, reason="Expected register message")
        return

    session_id = reg_msg.get("session_id", "")
    await ws.send_json({"type": "registered"})

    # Store connection in registry
    registry.set_connection(entity_id, ws)

    global_broadcast: GlobalBroadcastService = ws.app.state.global_broadcast

    try:
        await _handle_box(ws, entity_id, session_id, registry, relay, global_broadcast)
    except WebSocketDisconnect:
        logger.info("Box %s disconnected", entity_id)
    except Exception:
        logger.exception("Error in callback relay for box %s", entity_id)
    finally:
        # Clean up connection but keep token alive for reconnection
        registry.remove(entity_id)
        try:
            await ws.close()
        except Exception:
            pass


async def _handle_box(
    ws: WebSocket,
    box_id: str,
    session_id: str,
    registry: CallbackRegistry,
    relay: RelayService,
    global_broadcast: GlobalBroadcastService,
) -> None:
    """Handle a unified box callback connection."""
    from sqlalchemy.ext.asyncio import async_sessionmaker
    sf: async_sessionmaker = ws.app.state._sf

    # Load box to determine behaviour
    async with sf() as db:
        box = await db.get(Box, box_id)
        if box is None:
            return
        has_initial_prompt = bool(box.initial_prompt)
        initial_prompt = box.initial_prompt
        auto_stop = box.auto_stop
        box.session_id = session_id

        if has_initial_prompt:
            box.status = BoxStatus.RUNNING
        else:
            box.status = BoxStatus.IDLE
        await db.commit()

    status = BoxStatus.RUNNING if has_initial_prompt else BoxStatus.IDLE
    await relay.broadcast(
        box_id, {"type": "status_change", "status": status.value}
    )
    await global_broadcast.broadcast({
        "type": "box_status_changed",
        "box_id": box_id,
        "status": status.value,
    })
    logger.info("Box %s is %s (session %s)", box_id, status.value, session_id)

    if has_initial_prompt:
        # Wait for pre-start setup to complete (GitHub setup, etc.)
        ready = await registry.wait_for_prompt_ready(box_id, timeout=300)
        if not ready:
            logger.error("Box %s: pre-start setup timed out", box_id)
            await _set_box_failed(sf, relay, global_broadcast, box_id, "Pre-start setup timed out")
            return

        # Send the initial prompt
        await ws.send_json({"type": "message", "content": initial_prompt})
    else:
        # No initial prompt — signal prompt_ready immediately (already set by service)
        pass

    # Relay loop: read events from container, persist + broadcast
    async for raw in ws.iter_text():
        event = json.loads(raw)
        event_type = event.get("type", "")

        # Handle file-op responses
        if event_type in ("list_files_result", "read_file_result"):
            request_id = event.get("request_id", "")
            registry.resolve_pending_request(box_id, request_id, event)
            continue

        # Persist event
        await _persist_box_event(sf, box_id, event_type, event)

        # Broadcast to subscribers
        await relay.broadcast(box_id, event)

        # Handle terminal events
        if event_type == "done":
            if auto_stop:
                content = event.get("content", "")
                await _set_box_completed(sf, relay, global_broadcast, box_id, content)
                registry.remove_fully(box_id)
                return
            else:
                # Go to IDLE — box stays alive for follow-up
                await _set_box_idle(sf, relay, global_broadcast, box_id)

        elif event_type == "error":
            detail = event.get("detail", "Unknown error")
            await _set_box_failed(sf, relay, global_broadcast, box_id, detail)
            registry.remove_fully(box_id)
            return


# ------------------------------------------------------------------
# DB helpers
# ------------------------------------------------------------------


async def _persist_box_event(
    sf: Any, box_id: str, event_type: str, data: dict[str, Any]
) -> None:
    async with sf() as db:
        ev = BoxEvent(
            box_id=box_id,
            event_type=event_type,
            data=json.dumps(data),
        )
        db.add(ev)
        await db.commit()


async def _set_box_completed(
    sf: Any, relay: RelayService, global_broadcast: GlobalBroadcastService,
    box_id: str, result: str,
) -> None:
    from datetime import datetime, timezone
    async with sf() as db:
        box = await db.get(Box, box_id)
        if box:
            box.status = BoxStatus.COMPLETED
            box.result_summary = result
            box.completed_at = datetime.now(timezone.utc)
            await db.commit()
    await relay.broadcast(
        box_id, {"type": "status_change", "status": BoxStatus.COMPLETED.value}
    )
    await global_broadcast.broadcast({
        "type": "box_status_changed",
        "box_id": box_id,
        "status": BoxStatus.COMPLETED.value,
    })


async def _set_box_idle(
    sf: Any, relay: RelayService, global_broadcast: GlobalBroadcastService,
    box_id: str,
) -> None:
    async with sf() as db:
        box = await db.get(Box, box_id)
        if box:
            box.status = BoxStatus.IDLE
            await db.commit()
    await relay.broadcast(
        box_id, {"type": "status_change", "status": BoxStatus.IDLE.value}
    )
    await global_broadcast.broadcast({
        "type": "box_status_changed",
        "box_id": box_id,
        "status": BoxStatus.IDLE.value,
    })


async def _set_box_failed(
    sf: Any, relay: RelayService, global_broadcast: GlobalBroadcastService,
    box_id: str, error: str,
) -> None:
    from datetime import datetime, timezone
    async with sf() as db:
        box = await db.get(Box, box_id)
        if box:
            box.status = BoxStatus.FAILED
            box.error_message = error
            box.completed_at = datetime.now(timezone.utc)
            await db.commit()
    await relay.broadcast(
        box_id, {"type": "status_change", "status": BoxStatus.FAILED.value}
    )
    await relay.broadcast(
        box_id, {"type": "error", "detail": error}
    )
    await global_broadcast.broadcast({
        "type": "box_status_changed",
        "box_id": box_id,
        "status": BoxStatus.FAILED.value,
    })
