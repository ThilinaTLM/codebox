"""Task lifecycle management — create, start, cancel, and stream agent events."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from codebox_orchestrator.config import (
    CODEBOX_IMAGE,
    CODEBOX_PORT,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    WORKSPACE_BASE_DIR,
)
from codebox_orchestrator.db.models import Task, TaskEvent, TaskStatus
from codebox_orchestrator.services import docker_service
from codebox_orchestrator.services.relay_service import RelayService
from codebox_orchestrator.services.sandbox_client import SandboxClient

logger = logging.getLogger(__name__)


class TaskService:
    """Orchestrates task creation, sandbox lifecycle, and event streaming."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        relay: RelayService,
    ) -> None:
        self._sf = session_factory
        self._relay = relay
        # Background asyncio tasks keyed by task_id
        self._running: dict[str, asyncio.Task[None]] = {}
        # Active WebSocket connections keyed by task_id
        self._ws_connections: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create_task(
        self,
        title: str,
        prompt: str,
        model: str | None = None,
        system_prompt: str | None = None,
        workspace_path: str | None = None,
    ) -> Task:
        task = Task(
            title=title,
            prompt=prompt,
            model=model or OPENROUTER_MODEL,
            system_prompt=system_prompt,
            workspace_path=workspace_path,
        )
        async with self._sf() as db:
            db.add(task)
            await db.commit()
            await db.refresh(task)
        return task

    async def get_task(self, task_id: str) -> Task | None:
        async with self._sf() as db:
            return await db.get(Task, task_id)

    async def list_tasks(self, status: TaskStatus | None = None) -> list[Task]:
        async with self._sf() as db:
            stmt = select(Task).order_by(Task.created_at.desc())
            if status is not None:
                stmt = stmt.where(Task.status == status)
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def get_task_events(self, task_id: str) -> list[TaskEvent]:
        async with self._sf() as db:
            stmt = (
                select(TaskEvent)
                .where(TaskEvent.task_id == task_id)
                .order_by(TaskEvent.id)
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def delete_task(self, task_id: str) -> None:
        """Cancel if running, clean up container, delete from DB."""
        await self.cancel_task(task_id)
        async with self._sf() as db:
            task = await db.get(Task, task_id)
            if task:
                # Try to remove the container
                if task.container_name:
                    try:
                        docker_service.remove(task.container_name)
                    except Exception:
                        pass
                await db.delete(task)
                await db.commit()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start_task(self, task_id: str) -> None:
        """Spawn a sandbox container and begin the agent loop."""
        async with self._sf() as db:
            task = await db.get(Task, task_id)
            if task is None:
                raise ValueError(f"Task not found: {task_id}")
            task.status = TaskStatus.STARTING
            task.started_at = datetime.now(timezone.utc)
            await db.commit()

        await self._relay.broadcast(
            task_id, {"type": "status_change", "status": TaskStatus.STARTING.value}
        )

        bg = asyncio.create_task(self._run_task(task_id))
        self._running[task_id] = bg

    async def cancel_task(self, task_id: str) -> None:
        """Cancel a running task and stop its container."""
        # Cancel background asyncio task
        bg = self._running.pop(task_id, None)
        if bg and not bg.done():
            bg.cancel()

        # Send cancel over WebSocket if connected
        ws = self._ws_connections.pop(task_id, None)
        if ws:
            try:
                await SandboxClient.send_cancel(ws)
                await ws.close()
            except Exception:
                pass

        async with self._sf() as db:
            task = await db.get(Task, task_id)
            if task and task.status in (
                TaskStatus.STARTING,
                TaskStatus.RUNNING,
                TaskStatus.WAITING_FOR_FEEDBACK,
            ):
                task.status = TaskStatus.CANCELLED
                task.completed_at = datetime.now(timezone.utc)
                await db.commit()
                await self._relay.broadcast(
                    task_id, {"type": "status_change", "status": TaskStatus.CANCELLED.value}
                )
                # Stop container
                if task.container_name:
                    try:
                        docker_service.stop(task.container_name)
                    except Exception:
                        pass

    async def send_followup(self, task_id: str, message: str) -> None:
        """Send a follow-up message to a running agent."""
        ws = self._ws_connections.get(task_id)
        if ws is None:
            raise ValueError("No active WebSocket connection for this task")
        await SandboxClient.send_message(ws, message)

    async def shutdown(self) -> None:
        """Cancel all running background tasks (called on app shutdown)."""
        for task_id in list(self._running):
            bg = self._running.pop(task_id, None)
            if bg and not bg.done():
                bg.cancel()

    # ------------------------------------------------------------------
    # Background agent loop
    # ------------------------------------------------------------------

    async def _run_task(self, task_id: str) -> None:
        """Background coroutine: spawn container, connect, stream events."""
        try:
            await self._do_run_task(task_id)
        except asyncio.CancelledError:
            logger.info("Task %s was cancelled", task_id)
        except Exception as exc:
            logger.exception("Task %s failed: %s", task_id, exc)
            await self._set_failed(task_id, str(exc))
        finally:
            self._running.pop(task_id, None)
            self._ws_connections.pop(task_id, None)

    async def _do_run_task(self, task_id: str) -> None:
        # Load task
        async with self._sf() as db:
            task = await db.get(Task, task_id)
            if task is None:
                return
            prompt = task.prompt
            model = task.model
            system_prompt = task.system_prompt

        # Create workspace directory
        os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
        workspace = tempfile.mkdtemp(prefix=f"task-{task_id[:8]}-", dir=WORKSPACE_BASE_DIR)

        # Spawn container
        container_name = f"codebox-task-{task_id[:8]}"
        try:
            info = docker_service.spawn(
                image=CODEBOX_IMAGE,
                name=container_name,
                model=model,
                api_key=OPENROUTER_API_KEY,
                mount_path=workspace,
            )
        except docker_service.DockerServiceError as exc:
            await self._set_failed(task_id, f"Failed to spawn container: {exc}")
            return

        # Update task with container info
        async with self._sf() as db:
            task = await db.get(Task, task_id)
            if task is None:
                return
            task.container_id = info.id
            task.container_name = info.name
            task.host_port = info.port
            task.workspace_path = workspace
            await db.commit()

        # Wait for daemon to become healthy
        healthy = await asyncio.to_thread(
            docker_service.wait_for_healthy, container_name
        )
        if not healthy:
            await self._set_failed(task_id, "Sandbox daemon did not become healthy in time")
            return

        # Get auth token
        try:
            token = await asyncio.to_thread(docker_service.get_token, container_name)
        except docker_service.DockerServiceError as exc:
            await self._set_failed(task_id, f"Failed to get token: {exc}")
            return

        # Create sandbox client and session
        client = SandboxClient(host=container_name, port=CODEBOX_PORT, token=token)
        try:
            session_info = client.create_session(
                model=model,
                api_key=OPENROUTER_API_KEY,
                system_prompt=system_prompt,
            )
        except Exception as exc:
            await self._set_failed(task_id, f"Failed to create session: {exc}")
            return

        session_id = session_info["session_id"]

        # Update task with session ID and mark running
        async with self._sf() as db:
            task = await db.get(Task, task_id)
            if task is None:
                return
            task.session_id = session_id
            task.status = TaskStatus.RUNNING
            await db.commit()

        await self._relay.broadcast(
            task_id, {"type": "status_change", "status": TaskStatus.RUNNING.value}
        )

        # Connect WebSocket and stream events
        try:
            ws = await client.connect_session(session_id)
        except Exception as exc:
            await self._set_failed(task_id, f"Failed to connect WebSocket: {exc}")
            return

        self._ws_connections[task_id] = ws

        try:
            # Send the task prompt
            await SandboxClient.send_message(ws, prompt)

            # Stream events
            async for event in SandboxClient.receive_events(ws):
                event_type = event.get("type", "")

                # Persist event
                await self._persist_event(task_id, event_type, event)

                # Broadcast to SSE subscribers
                await self._relay.broadcast(task_id, event)

                # Handle terminal events
                if event_type == "done":
                    await self._set_completed(task_id, event.get("content", ""))
                    return
                elif event_type == "error":
                    await self._set_failed(task_id, event.get("detail", "Unknown error"))
                    return

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self._set_failed(task_id, f"WebSocket error: {exc}")
        finally:
            try:
                await ws.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # State updates
    # ------------------------------------------------------------------

    async def _set_failed(self, task_id: str, error: str) -> None:
        async with self._sf() as db:
            task = await db.get(Task, task_id)
            if task:
                task.status = TaskStatus.FAILED
                task.error_message = error
                task.completed_at = datetime.now(timezone.utc)
                await db.commit()
        await self._relay.broadcast(
            task_id, {"type": "status_change", "status": TaskStatus.FAILED.value}
        )
        await self._relay.broadcast(
            task_id, {"type": "error", "detail": error}
        )

    async def _set_completed(self, task_id: str, result: str) -> None:
        async with self._sf() as db:
            task = await db.get(Task, task_id)
            if task:
                task.status = TaskStatus.COMPLETED
                task.result_summary = result
                task.completed_at = datetime.now(timezone.utc)
                await db.commit()
        await self._relay.broadcast(
            task_id, {"type": "status_change", "status": TaskStatus.COMPLETED.value}
        )

    async def _persist_event(
        self, task_id: str, event_type: str, data: dict[str, Any]
    ) -> None:
        async with self._sf() as db:
            ev = TaskEvent(
                task_id=task_id,
                event_type=event_type,
                data=json.dumps(data),
            )
            db.add(ev)
            await db.commit()
