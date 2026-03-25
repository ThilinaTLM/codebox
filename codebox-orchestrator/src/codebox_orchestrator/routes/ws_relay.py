"""WebSocket relay endpoint for real-time client communication.

Clients (web-ui, CLI) connect here to stream task events and send commands.
On connect, persisted events are replayed from the DB, then live relay takes over.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from codebox_orchestrator.services.relay_service import RelayService
from codebox_orchestrator.services.task_service import TaskService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.websocket("/tasks/{task_id}/ws")
async def task_websocket(ws: WebSocket, task_id: str):
    """Bidirectional WebSocket for a specific task.

    Server → Client events (mirrors sandbox protocol + orchestrator additions):
        {"type": "token", "text": "..."}
        {"type": "tool_start", "name": "..."}
        {"type": "tool_end", "name": "...", "output": "..."}
        {"type": "model_start"}
        {"type": "done", "content": "..."}
        {"type": "error", "detail": "..."}
        {"type": "status_change", "status": "running"}

    Client → Server commands:
        {"type": "message", "content": "..."}   — follow-up to agent
        {"type": "cancel"}                       — cancel running task
    """
    await ws.accept()

    relay: RelayService = ws.app.state.relay_service
    task_service: TaskService = ws.app.state.task_service

    # Verify task exists
    task = await task_service.get_task(task_id)
    if task is None:
        await ws.send_json({"type": "error", "detail": "Task not found"})
        await ws.close(code=4004)
        return

    # Replay persisted events from DB
    try:
        events = await task_service.get_task_events(task_id)
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
        logger.warning("Failed to replay events for task %s: %s", task_id, exc)

    # Subscribe to live events
    queue = relay.subscribe(task_id)

    try:
        await asyncio.gather(
            _forward_events(ws, queue),
            _receive_commands(ws, task_id, task_service),
        )
    except WebSocketDisconnect:
        logger.debug("Client disconnected from task %s", task_id)
    except Exception as exc:
        logger.warning("WebSocket error for task %s: %s", task_id, exc)
    finally:
        relay.unsubscribe(task_id, queue)


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

        # Stop forwarding after terminal events
        event_type = event.get("type", "")
        if event_type in ("done", "error"):
            return


async def _receive_commands(
    ws: WebSocket,
    task_id: str,
    task_service: TaskService,
) -> None:
    """Receive and process client commands."""
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
                    await task_service.send_followup(task_id, content)
                except ValueError as exc:
                    await ws.send_json({"type": "error", "detail": str(exc)})

        elif msg_type == "cancel":
            await task_service.cancel_task(task_id)

        else:
            await ws.send_json({"type": "error", "detail": f"Unknown message type: {msg_type}"})
