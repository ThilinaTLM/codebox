"""Task lifecycle management — create, start, cancel, and stream agent events."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import tempfile
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from codebox_orchestrator.config import (
    CODEBOX_IMAGE,
    GITHUB_DEFAULT_BASE_BRANCH,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    ORCHESTRATOR_CALLBACK_URL,
    TAVILY_API_KEY,
    WORKSPACE_BASE_DIR,
)
from codebox_orchestrator.db.models import Task, TaskEvent, TaskStatus
from codebox_orchestrator.services import docker_service
from codebox_orchestrator.services.callback_registry import CallbackRegistry
from codebox_orchestrator.services.relay_service import RelayService

logger = logging.getLogger(__name__)

_CALLBACK_TIMEOUT = 60.0  # seconds to wait for sandbox to connect back


class TaskService:
    """Orchestrates task creation, sandbox lifecycle, and event streaming."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        relay: RelayService,
        registry: CallbackRegistry,
    ) -> None:
        self._sf = session_factory
        self._relay = relay
        self._registry = registry
        # Background asyncio tasks keyed by task_id
        self._running: dict[str, asyncio.Task[None]] = {}

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
        # GitHub integration fields
        github_installation_id: str | None = None,
        github_repo: str | None = None,
        github_issue_number: int | None = None,
        github_trigger_url: str | None = None,
        github_branch: str | None = None,
    ) -> Task:
        task = Task(
            title=title,
            prompt=prompt,
            model=model or OPENROUTER_MODEL,
            system_prompt=system_prompt,
            workspace_path=workspace_path,
            github_installation_id=github_installation_id,
            github_repo=github_repo,
            github_issue_number=github_issue_number,
            github_trigger_url=github_trigger_url,
            github_branch=github_branch,
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

        # Send cancel over callback WS if connected
        ws = self._registry.get_connection(task_id)
        if ws:
            try:
                await ws.send_json({"type": "cancel"})
                await ws.close()
            except Exception:
                pass
        self._registry.remove(task_id)

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
        ws = self._registry.get_connection(task_id)
        if ws is None:
            raise ValueError("No active connection for this task")
        await ws.send_json({"type": "message", "content": message})

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
        """Background coroutine: spawn container, wait for callback."""
        try:
            await self._do_run_task(task_id)
        except asyncio.CancelledError:
            logger.info("Task %s was cancelled", task_id)
        except Exception as exc:
            logger.exception("Task %s failed: %s", task_id, exc)
            await self._set_failed(task_id, str(exc))
        finally:
            self._running.pop(task_id, None)

    async def _do_run_task(self, task_id: str) -> None:
        # Load task
        async with self._sf() as db:
            task = await db.get(Task, task_id)
            if task is None:
                return
            model = task.model
            system_prompt = task.system_prompt
            github_repo = task.github_repo
            github_branch = task.github_branch
            github_issue_number = task.github_issue_number
            github_installation_id = task.github_installation_id

        is_github_task = bool(github_repo)

        # Create workspace directory (for non-GitHub tasks; GitHub tasks clone into /workspace)
        os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
        workspace = tempfile.mkdtemp(prefix=f"task-{task_id[:8]}-", dir=WORKSPACE_BASE_DIR)

        # Generate callback token
        callback_token = secrets.token_urlsafe(32)
        self._registry.register(callback_token, task_id, "task")

        # Spawn container with callback env vars
        container_name = f"codebox-task-{task_id[:8]}"
        extra_env: dict[str, str] = {
            "ORCHESTRATOR_CALLBACK_URL": ORCHESTRATOR_CALLBACK_URL,
            "CALLBACK_TOKEN": callback_token,
        }
        if system_prompt:
            extra_env["SYSTEM_PROMPT"] = system_prompt

        # For GitHub tasks, get installation token and inject env vars
        gh_token: str | None = None
        if is_github_task:
            sandbox_config = {
                "timeout": 300,
                "recursion_limit": 200,
                "temperature": 0,
            }
            extra_env["CODEBOX_SANDBOX_CONFIG"] = json.dumps(sandbox_config)
            extra_env["CODEBOX_GITHUB_REPO"] = github_repo or ""
            if github_branch:
                extra_env["CODEBOX_BRANCH"] = github_branch
            if github_issue_number is not None:
                extra_env["CODEBOX_GITHUB_ISSUE_NUMBER"] = str(github_issue_number)

            # Get installation token BEFORE spawning so it's a real env var
            gh_token = await self._get_github_token(github_installation_id)
            extra_env["GH_TOKEN"] = gh_token
            extra_env["CODEBOX_GITHUB_REF"] = GITHUB_DEFAULT_BASE_BRANCH

        try:
            info = docker_service.spawn(
                image=CODEBOX_IMAGE,
                name=container_name,
                model=model,
                api_key=OPENROUTER_API_KEY,
                tavily_api_key=TAVILY_API_KEY,
                mount_path=workspace,
                extra_env=extra_env,
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
            task.callback_token = callback_token
            task.workspace_path = workspace
            await db.commit()

        # Wait for sandbox to connect back
        connected = await self._registry.wait_for_connection(task_id, timeout=_CALLBACK_TIMEOUT)
        if not connected:
            await self._set_failed(task_id, "Sandbox did not connect back in time")
            return

        # Run pre-start setup commands for GitHub tasks
        if is_github_task and gh_token:
            try:
                await self._run_github_setup(
                    container_name=info.name,
                    task_id=task_id,
                    github_repo=github_repo or "",
                    github_branch=github_branch or "",
                    github_token=gh_token,
                    github_issue_number=github_issue_number,
                )
            except Exception as exc:
                logger.exception("GitHub setup failed for task %s", task_id)
                await self._set_failed(task_id, f"GitHub setup failed: {exc}")
                return

        # Signal that setup is done — ws_callback can now send the prompt
        self._registry.set_prompt_ready(task_id)

        # Task is now RUNNING (status updated + prompt sent by ws_callback endpoint)
        logger.info("Task %s started successfully", task_id)

    async def _get_github_token(self, github_installation_id: str | None) -> str:
        """Get a GitHub installation token for a task."""
        if not hasattr(self, "_github_service") or self._github_service is None:
            raise RuntimeError("GitHub service not available")

        if not github_installation_id:
            raise RuntimeError("No GitHub installation ID for task")

        async with self._sf() as db:
            from codebox_orchestrator.db.models import GitHubInstallation
            installation = await db.get(GitHubInstallation, github_installation_id)
            if installation is None:
                raise RuntimeError(f"GitHub installation not found: {github_installation_id}")
            gh_installation_id = installation.installation_id

        return await self._github_service.get_installation_token(gh_installation_id)

    async def _run_github_setup(
        self,
        container_name: str,
        task_id: str,
        github_repo: str,
        github_branch: str,
        github_token: str,
        github_issue_number: int | None,
    ) -> None:
        """Run pre-start setup commands inside the container for GitHub tasks."""
        if not hasattr(self, "_github_service") or self._github_service is None:
            raise RuntimeError("GitHub service not available")

        setup_commands = self._github_service.build_setup_commands(
            repo=github_repo,
            branch=github_branch,
            token=github_token,
            issue_number=github_issue_number,
        )

        docker_service.exec_commands(container_name, setup_commands)

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
