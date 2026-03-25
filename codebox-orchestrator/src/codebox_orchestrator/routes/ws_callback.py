"""Internal WebSocket endpoint that sandbox containers connect to.

Sandbox containers initiate the connection back to this endpoint after
startup, reversing the traditional orchestrator→sandbox direction.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from codebox_orchestrator.db.models import (
    Sandbox,
    SandboxEvent,
    SandboxStatus,
    Task,
    TaskEvent,
    TaskStatus,
)
from codebox_orchestrator.services.callback_registry import CallbackRegistry
from codebox_orchestrator.services.relay_service import RelayService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/api/internal/sandbox/connect")
async def sandbox_callback(ws: WebSocket) -> None:
    """Accept inbound WebSocket from a sandbox container."""
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
    logger.info("Sandbox callback accepted for %s %s", entity_type, entity_id)

    # Wait for register message
    try:
        raw = await ws.receive_text()
        reg_msg = json.loads(raw)
    except (WebSocketDisconnect, Exception) as exc:
        logger.warning("Sandbox %s disconnected during registration: %s", entity_id, exc)
        return

    if reg_msg.get("type") != "register":
        await ws.close(code=4002, reason="Expected register message")
        return

    session_id = reg_msg.get("session_id", "")
    await ws.send_json({"type": "registered"})

    # Store connection in registry
    registry.set_connection(entity_id, ws)

    try:
        if entity_type == "sandbox":
            await _handle_sandbox(ws, entity_id, session_id, registry, relay)
        elif entity_type == "task":
            await _handle_task(ws, entity_id, session_id, registry, relay)
    except WebSocketDisconnect:
        logger.info("%s %s disconnected", entity_type, entity_id)
    except Exception:
        logger.exception("Error in callback relay for %s %s", entity_type, entity_id)
    finally:
        registry.remove(entity_id)
        try:
            await ws.close()
        except Exception:
            pass


async def _handle_sandbox(
    ws: WebSocket,
    sandbox_id: str,
    session_id: str,
    registry: CallbackRegistry,
    relay: RelayService,
) -> None:
    """Handle an interactive sandbox callback connection."""
    from sqlalchemy.ext.asyncio import async_sessionmaker
    sf: async_sessionmaker = ws.app.state._sf

    # Update DB: mark sandbox as ready
    async with sf() as db:
        sandbox = await db.get(Sandbox, sandbox_id)
        if sandbox:
            sandbox.session_id = session_id
            sandbox.status = SandboxStatus.READY
            await db.commit()

    await relay.broadcast(
        sandbox_id, {"type": "status_change", "status": SandboxStatus.READY.value}
    )

    logger.info("Sandbox %s is READY (session %s)", sandbox_id, session_id)

    # Relay loop: read events from sandbox, persist + broadcast
    async for raw in ws.iter_text():
        event = json.loads(raw)
        event_type = event.get("type", "")

        # Handle file-op responses
        if event_type in ("list_files_result", "read_file_result"):
            request_id = event.get("request_id", "")
            registry.resolve_pending_request(sandbox_id, request_id, event)
            continue

        # Persist event
        await _persist_sandbox_event(sf, sandbox_id, event_type, event)

        # Broadcast to subscribers
        await relay.broadcast(sandbox_id, event)


async def _handle_task(
    ws: WebSocket,
    task_id: str,
    session_id: str,
    registry: CallbackRegistry,
    relay: RelayService,
) -> None:
    """Handle a task callback connection."""
    from sqlalchemy.ext.asyncio import async_sessionmaker
    sf: async_sessionmaker = ws.app.state._sf

    # Update DB: mark task as running
    async with sf() as db:
        task = await db.get(Task, task_id)
        if task is None:
            return
        task.session_id = session_id
        task.status = TaskStatus.RUNNING
        prompt = task.prompt
        await db.commit()

    await relay.broadcast(
        task_id, {"type": "status_change", "status": TaskStatus.RUNNING.value}
    )

    logger.info("Task %s is RUNNING (session %s)", task_id, session_id)

    # Wait for pre-start setup to complete (non-GitHub tasks are signalled immediately)
    ready = await registry.wait_for_prompt_ready(task_id, timeout=300)
    if not ready:
        logger.error("Task %s: pre-start setup timed out", task_id)
        await _set_task_failed(sf, relay, task_id, "Pre-start setup timed out")
        return

    # Send the task prompt to the sandbox
    await ws.send_json({"type": "message", "content": prompt})

    # Relay loop: read events from sandbox, persist + broadcast
    async for raw in ws.iter_text():
        event = json.loads(raw)
        event_type = event.get("type", "")

        # Handle file-op responses
        if event_type in ("list_files_result", "read_file_result"):
            request_id = event.get("request_id", "")
            registry.resolve_pending_request(task_id, request_id, event)
            continue

        # Persist event
        await _persist_task_event(sf, task_id, event_type, event)

        # Broadcast to subscribers
        await relay.broadcast(task_id, event)

        # Handle terminal events
        if event_type == "done":
            content = event.get("content", "")
            await _set_task_completed(sf, relay, task_id, content)
            return
        elif event_type == "error":
            detail = event.get("detail", "Unknown error")
            await _set_task_failed(sf, relay, task_id, detail)
            return


# ------------------------------------------------------------------
# DB helpers
# ------------------------------------------------------------------


async def _persist_sandbox_event(
    sf: Any, sandbox_id: str, event_type: str, data: dict[str, Any]
) -> None:
    async with sf() as db:
        ev = SandboxEvent(
            sandbox_id=sandbox_id,
            event_type=event_type,
            data=json.dumps(data),
        )
        db.add(ev)
        await db.commit()


async def _persist_task_event(
    sf: Any, task_id: str, event_type: str, data: dict[str, Any]
) -> None:
    async with sf() as db:
        ev = TaskEvent(
            task_id=task_id,
            event_type=event_type,
            data=json.dumps(data),
        )
        db.add(ev)
        await db.commit()


async def _set_task_completed(sf: Any, relay: RelayService, task_id: str, result: str) -> None:
    from datetime import datetime, timezone
    async with sf() as db:
        task = await db.get(Task, task_id)
        if task:
            task.status = TaskStatus.COMPLETED
            task.result_summary = result
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()
    await relay.broadcast(
        task_id, {"type": "status_change", "status": TaskStatus.COMPLETED.value}
    )


async def _set_task_failed(sf: Any, relay: RelayService, task_id: str, error: str) -> None:
    from datetime import datetime, timezone
    async with sf() as db:
        task = await db.get(Task, task_id)
        if task:
            task.status = TaskStatus.FAILED
            task.error_message = error
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()
    await relay.broadcast(
        task_id, {"type": "status_change", "status": TaskStatus.FAILED.value}
    )
    await relay.broadcast(
        task_id, {"type": "error", "detail": error}
    )
