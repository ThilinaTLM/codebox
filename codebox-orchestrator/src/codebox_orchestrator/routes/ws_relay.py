"""WebSocket relay endpoint for real-time client communication.

Clients (web-ui, CLI) connect here to stream box events and send commands.
On connect, persisted events are replayed from the DB, then live relay takes over.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from codebox_orchestrator.services.box_service import BoxService
from codebox_orchestrator.services.relay_service import RelayService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.websocket("/boxes/{box_id}/ws")
async def box_websocket(ws: WebSocket, box_id: str):
    """Bidirectional WebSocket for a box.

    Server → Client events:
        {"type": "token", "text": "..."}
        {"type": "tool_start", "name": "..."}
        {"type": "tool_end", "name": "...", "output": "..."}
        {"type": "model_start"}
        {"type": "done", "content": "..."}
        {"type": "error", "detail": "..."}
        {"type": "status_change", "status": "running"}
        {"type": "exec_output", "output": "..."}
        {"type": "exec_done", "output": "exit_code"}

    Client → Server commands:
        {"type": "message", "content": "..."}   — chat message to agent
        {"type": "exec", "content": "..."}       — shell command
        {"type": "cancel"}                       — cancel current operation
    """
    await ws.accept()

    relay: RelayService = ws.app.state.relay_service
    box_service: BoxService = ws.app.state.box_service

    # Verify box exists
    box = await box_service.get_box(box_id)
    if box is None:
        await ws.send_json({"type": "error", "detail": "Box not found"})
        await ws.close(code=4004)
        return

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
                await ws.send_json(data)
    except Exception as exc:
        logger.warning("Failed to replay events for box %s: %s", box_id, exc)

    # Subscribe to live events
    queue = relay.subscribe(box_id)

    try:
        await asyncio.gather(
            _forward_events(ws, queue),
            _receive_commands(ws, box_id, box_service),
        )
    except WebSocketDisconnect:
        logger.debug("Client disconnected from box %s", box_id)
    except Exception as exc:
        logger.warning("WebSocket error for box %s: %s", box_id, exc)
    finally:
        relay.unsubscribe(box_id, queue)


async def _forward_events(
    ws: WebSocket,
    queue: asyncio.Queue[dict[str, Any]],
) -> None:
    """Forward relay events to the client WebSocket."""
    while True:
        try:
            event = await asyncio.wait_for(queue.get(), timeout=30.0)
        except asyncio.TimeoutError:
            # Send keepalive ping
            try:
                await ws.send_json({"type": "ping"})
            except Exception:
                return
            continue

        try:
            await ws.send_json(event)
        except Exception:
            return


async def _receive_commands(
    ws: WebSocket,
    box_id: str,
    box_service: BoxService,
) -> None:
    """Receive and route client commands."""
    while True:
        try:
            raw = await ws.receive_text()
        except WebSocketDisconnect:
            raise
        except Exception:
            return

        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await ws.send_json({"type": "error", "detail": "Invalid JSON"})
            continue

        msg_type = msg.get("type", "")

        if msg_type == "message":
            content = msg.get("content", "")
            if content:
                try:
                    await box_service.send_message(box_id, content)
                except ValueError as exc:
                    await ws.send_json({"type": "error", "detail": str(exc)})

        elif msg_type == "exec":
            command = msg.get("content", "")
            if command:
                try:
                    await box_service.send_exec(box_id, command)
                except ValueError as exc:
                    await ws.send_json({"type": "error", "detail": str(exc)})

        elif msg_type == "cancel":
            try:
                await box_service.send_cancel(box_id)
            except ValueError as exc:
                await ws.send_json({"type": "error", "detail": str(exc)})

        else:
            await ws.send_json({"type": "error", "detail": f"Unknown message type: {msg_type}"})
