"""Box lifecycle management — create, start, stop, and relay events."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from codebox_orchestrator.config import (
    CODEBOX_IMAGE,
    GITHUB_DEFAULT_BASE_BRANCH,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    ORCHESTRATOR_GRPC_ADDRESS,
    TAVILY_API_KEY,
    WORKSPACE_BASE_DIR,
)
from codebox_orchestrator.db.models import Box, BoxEvent, BoxMessage, ContainerStatus, TaskStatus
from codebox_orchestrator.services import docker_service
from codebox_orchestrator.services.callback_registry import CallbackRegistry
from codebox_orchestrator.services.global_broadcast_service import GlobalBroadcastService
from codebox_orchestrator.services.relay_service import RelayService

logger = logging.getLogger(__name__)

_CALLBACK_TIMEOUT = 60.0  # seconds to wait for container to connect back
_FILE_OP_TIMEOUT = 10.0  # seconds to wait for file operation responses


class BoxService:
    """Orchestrates box creation, container lifecycle, and event streaming."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        relay: RelayService,
        registry: CallbackRegistry,
        global_broadcast: GlobalBroadcastService,
    ) -> None:
        self._sf = session_factory
        self._relay = relay
        self._registry = registry
        self._global_broadcast = global_broadcast
        self._running: dict[str, asyncio.Task[None]] = {}
        # Injected by app.py when GitHub is configured
        self._github_service: Any = None

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create_box(
        self,
        name: str | None = None,
        model: str | None = None,
        system_prompt: str | None = None,
        initial_prompt: str | None = None,
        idle_timeout: int | None = None,
        # GitHub integration fields
        trigger: str | None = None,
        github_installation_id: str | None = None,
        github_repo: str | None = None,
        github_issue_number: int | None = None,
        github_trigger_url: str | None = None,
        github_branch: str | None = None,
    ) -> Box:
        box = Box(
            name=name or "box",
            model=model or OPENROUTER_MODEL,
            container_status=ContainerStatus.STARTING,
            task_status=TaskStatus.IDLE,
            idle_timeout=idle_timeout if idle_timeout is not None else 60,
            system_prompt=system_prompt,
            initial_prompt=initial_prompt,
            trigger=trigger,
            github_installation_id=github_installation_id,
            github_repo=github_repo,
            github_issue_number=github_issue_number,
            github_trigger_url=github_trigger_url,
            github_branch=github_branch,
        )
        async with self._sf() as db:
            db.add(box)
            await db.commit()
            await db.refresh(box)

        # Start container in background
        box.started_at = datetime.now(timezone.utc)
        async with self._sf() as db:
            db_box = await db.get(Box, box.id)
            if db_box:
                db_box.started_at = box.started_at
                await db.commit()

        await self._relay.broadcast(
            box.id, {"type": "status_change", "container_status": ContainerStatus.STARTING.value}
        )
        await self._global_broadcast.broadcast({
            "type": "box_created",
            "box_id": box.id,
            "name": box.name,
            "container_status": ContainerStatus.STARTING.value,
            "model": box.model,
            "created_at": box.created_at.isoformat(),
        })
        bg = asyncio.create_task(self._run_box(box.id))
        self._running[box.id] = bg
        return box

    async def get_box(self, box_id: str) -> Box | None:
        async with self._sf() as db:
            return await db.get(Box, box_id)

    async def list_boxes(
        self,
        container_status: ContainerStatus | None = None,
        task_status: TaskStatus | None = None,
        trigger: str | None = None,
    ) -> list[Box]:
        async with self._sf() as db:
            stmt = select(Box).order_by(Box.created_at.desc())
            if container_status is not None:
                stmt = stmt.where(Box.container_status == container_status)
            if task_status is not None:
                stmt = stmt.where(Box.task_status == task_status)
            if trigger is not None:
                stmt = stmt.where(Box.trigger == trigger)
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def get_box_events(self, box_id: str) -> list[BoxEvent]:
        async with self._sf() as db:
            stmt = (
                select(BoxEvent)
                .where(BoxEvent.box_id == box_id)
                .order_by(BoxEvent.id)
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def get_box_messages(self, box_id: str) -> list[BoxMessage]:
        async with self._sf() as db:
            stmt = (
                select(BoxMessage)
                .where(BoxMessage.box_id == box_id)
                .order_by(BoxMessage.seq)
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def _persist_box_message(
        self, box_id: str, msg_data: dict[str, Any]
    ) -> None:
        """Persist a structured message to box_messages."""
        import json as _json
        async with self._sf() as db:
            result = await db.execute(
                select(func.coalesce(func.max(BoxMessage.seq), 0))
                .where(BoxMessage.box_id == box_id)
            )
            max_seq = result.scalar()
            next_seq = max_seq + 1

            tool_calls = msg_data.get("tool_calls")
            tool_calls_json = _json.dumps(tool_calls) if tool_calls else None

            bm = BoxMessage(
                box_id=box_id,
                seq=next_seq,
                role=msg_data.get("role", ""),
                content=msg_data.get("content"),
                tool_calls=tool_calls_json,
                tool_call_id=msg_data.get("tool_call_id"),
                tool_name=msg_data.get("tool_name"),
                metadata_json=msg_data.get("metadata_json"),
            )
            db.add(bm)
            await db.commit()

    async def delete_box(self, box_id: str) -> None:
        """Stop and delete box, including container and DB record."""
        await self.stop_box(box_id)
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box:
                if box.container_name:
                    try:
                        docker_service.remove(box.container_name)
                    except Exception:
                        pass
                await db.delete(box)
                await db.commit()
        await self._global_broadcast.broadcast({
            "type": "box_deleted",
            "box_id": box_id,
        })

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def stop_box(self, box_id: str) -> None:
        """Stop a box and its container."""
        bg = self._running.pop(box_id, None)
        if bg and not bg.done():
            bg.cancel()

        self._registry.remove_fully(box_id)

        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box and box.container_status != ContainerStatus.STOPPED:
                box.container_status = ContainerStatus.STOPPED
                box.stop_reason = "user_stopped"
                box.task_status = TaskStatus.IDLE
                box.completed_at = datetime.now(timezone.utc)
                await db.commit()
                if box.container_name:
                    try:
                        docker_service.stop(box.container_name)
                    except Exception:
                        pass
                await self._relay.broadcast(
                    box_id, {
                        "type": "status_change",
                        "container_status": ContainerStatus.STOPPED.value,
                        "stop_reason": "user_stopped",
                    }
                )
                await self._global_broadcast.broadcast({
                    "type": "box_status_changed",
                    "box_id": box_id,
                    "container_status": ContainerStatus.STOPPED.value,
                    "stop_reason": "user_stopped",
                })

    async def restart_box(self, box_id: str) -> Box:
        """Restart a stopped box by spawning a new container."""
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box is None:
                raise ValueError("Box not found")
            if box.container_status != ContainerStatus.STOPPED:
                raise ValueError("Box is not stopped")
            box.container_status = ContainerStatus.STARTING
            box.stop_reason = None
            box.task_status = TaskStatus.IDLE
            box.started_at = datetime.now(timezone.utc)
            box.completed_at = None
            await db.commit()

        await self._relay.broadcast(
            box_id, {"type": "status_change", "container_status": ContainerStatus.STARTING.value}
        )
        await self._global_broadcast.broadcast({
            "type": "box_status_changed",
            "box_id": box_id,
            "container_status": ContainerStatus.STARTING.value,
        })
        bg = asyncio.create_task(self._run_box(box_id))
        self._running[box_id] = bg

        async with self._sf() as db:
            return await db.get(Box, box_id)

    async def cancel_box(self, box_id: str) -> None:
        """Cancel a running box operation."""
        conn = self._registry.get_connection(box_id)
        if conn:
            try:
                await conn.send_json({"type": "cancel"})
            except Exception:
                pass

    async def send_message(self, box_id: str, content: str) -> None:
        """Send a chat message to the box agent."""
        # Persist user message to box_messages before forwarding
        await self._persist_box_message(box_id, {
            "role": "user",
            "content": content,
        })

        # Persist as event so it appears on reconnect/replay
        event_data = {"type": "user_message", "content": content}
        async with self._sf() as db:
            db.add(BoxEvent(
                box_id=box_id,
                event_type="user_message",
                data=json.dumps(event_data),
            ))
            await db.commit()

        # Broadcast to SSE/relay subscribers
        await self._relay.broadcast(box_id, event_data)

        conn = self._registry.get_connection(box_id)
        if conn is None:
            raise ValueError("No active connection for this box")
        await conn.send_json({"type": "message", "content": content})

    async def send_exec(self, box_id: str, command: str) -> None:
        """Send a shell command for direct execution."""
        # Persist as event so it appears on reconnect/replay
        event_data = {"type": "user_exec", "command": command}
        async with self._sf() as db:
            db.add(BoxEvent(
                box_id=box_id,
                event_type="user_exec",
                data=json.dumps(event_data),
            ))
            await db.commit()

        # Broadcast to SSE/relay subscribers
        await self._relay.broadcast(box_id, event_data)

        conn = self._registry.get_connection(box_id)
        if conn is None:
            raise ValueError("No active connection for this box")
        await conn.send_json({"type": "exec", "content": command})

    async def send_exec_and_wait(
        self, box_id: str, command: str, timeout: float = 120.0
    ) -> dict:
        """Send a shell command and wait for exec_done response.

        Raises RuntimeError if the command returns a non-zero exit code.
        """
        conn = self._registry.get_connection(box_id)
        if conn is None:
            raise ValueError("No active connection for this box")
        request_id, fut = self._registry.create_pending_request(box_id)
        await conn.send_json({
            "type": "exec",
            "content": command,
            "request_id": request_id,
        })
        result = await asyncio.wait_for(fut, timeout=timeout)
        exit_code = result.get("output", "")
        if exit_code not in ("0", ""):
            raise RuntimeError(
                f"Setup command failed (exit {exit_code}): {command}"
            )
        return result

    async def send_cancel(self, box_id: str) -> None:
        """Cancel the current operation."""
        conn = self._registry.get_connection(box_id)
        if conn is None:
            raise ValueError("No active connection for this box")
        await conn.send_json({"type": "cancel"})

    # ------------------------------------------------------------------
    # File browsing (via callback connection)
    # ------------------------------------------------------------------

    async def list_files(self, box_id: str, path: str = "/workspace") -> dict[str, Any]:
        conn = self._registry.get_connection(box_id)
        if conn is None:
            raise ValueError("No active connection for this box")
        request_id, fut = self._registry.create_pending_request(box_id)
        await conn.send_json({"type": "list_files", "path": path, "request_id": request_id})
        result = await asyncio.wait_for(fut, timeout=_FILE_OP_TIMEOUT)
        if "error" in result:
            raise RuntimeError(result["error"])
        return result.get("data", {})

    async def read_file(self, box_id: str, path: str) -> dict[str, Any]:
        conn = self._registry.get_connection(box_id)
        if conn is None:
            raise ValueError("No active connection for this box")
        request_id, fut = self._registry.create_pending_request(box_id)
        await conn.send_json({"type": "read_file", "path": path, "request_id": request_id})
        result = await asyncio.wait_for(fut, timeout=_FILE_OP_TIMEOUT)
        if "error" in result:
            raise RuntimeError(result["error"])
        return result.get("data", {})

    # ------------------------------------------------------------------
    # Shutdown
    # ------------------------------------------------------------------

    async def shutdown(self) -> None:
        """Cancel all running background tasks (called on app shutdown)."""
        for box_id in list(self._running):
            bg = self._running.pop(box_id, None)
            if bg and not bg.done():
                bg.cancel()
            async with self._sf() as db:
                box = await db.get(Box, box_id)
                if box and box.container_status != ContainerStatus.STOPPED:
                    box.container_status = ContainerStatus.STOPPED
                    box.stop_reason = "orchestrator_shutdown"
                    box.task_status = TaskStatus.IDLE
                    await db.commit()

    # ------------------------------------------------------------------
    # Background container loop
    # ------------------------------------------------------------------

    async def _run_box(self, box_id: str) -> None:
        """Background coroutine: spawn container, wait for callback."""
        try:
            await self._do_run_box(box_id)
        except asyncio.CancelledError:
            logger.info("Box %s was cancelled", box_id)
        except Exception as exc:
            logger.exception("Box %s failed: %s", box_id, exc)
            await self._set_container_error(box_id, str(exc))
        finally:
            self._running.pop(box_id, None)

    async def _do_run_box(self, box_id: str) -> None:
        # Load box
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box is None:
                return
            model = box.model
            system_prompt = box.system_prompt
            idle_timeout = box.idle_timeout
            github_repo = box.github_repo
            github_branch = box.github_branch
            github_issue_number = box.github_issue_number
            github_installation_id = box.github_installation_id
            existing_workspace = box.workspace_path

        is_github = bool(github_repo)

        # Create workspace directory (reuse existing for restarts)
        os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
        if existing_workspace and os.path.isdir(existing_workspace):
            workspace = existing_workspace
        else:
            workspace = tempfile.mkdtemp(prefix=f"box-{box_id[:8]}-", dir=WORKSPACE_BASE_DIR)

        # Generate JWT callback token
        from codebox_orchestrator.services.callback_token import create_callback_token
        callback_token = create_callback_token(box_id, entity_type="box")
        self._registry.init_connection_state(box_id)

        # Build container env vars
        container_name = f"codebox-box-{box_id[:8]}"
        extra_env: dict[str, str] = {
            "ORCHESTRATOR_GRPC_ADDRESS": ORCHESTRATOR_GRPC_ADDRESS,
            "CALLBACK_TOKEN": callback_token,
            "CODEBOX_IDLE_TIMEOUT": str(idle_timeout),
        }
        if system_prompt:
            extra_env["SYSTEM_PROMPT"] = system_prompt

        # For GitHub boxes, get installation token and inject env vars
        gh_token: str | None = None
        if is_github:
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
            await self._set_container_error(box_id, f"Failed to spawn container: {exc}")
            return

        # Update box with container info
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box is None:
                return
            box.container_id = info.id
            box.container_name = info.name
            box.workspace_path = workspace
            await db.commit()

        # Wait for container to connect back
        connected = await self._registry.wait_for_connection(box_id, timeout=_CALLBACK_TIMEOUT)
        if not connected:
            await self._set_container_error(box_id, "Container did not connect back in time")
            return

        # Run pre-start setup commands for GitHub boxes via WebSocket exec
        if is_github and gh_token:
            try:
                await self._run_github_setup(
                    box_id=box_id,
                    github_repo=github_repo or "",
                    github_branch=github_branch or "",
                    github_token=gh_token,
                    github_issue_number=github_issue_number,
                )
            except Exception as exc:
                logger.exception("GitHub setup failed for box %s", box_id)
                await self._set_container_error(box_id, f"GitHub setup failed: {exc}")
                return

        # Send initial prompt and set status
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box is None:
                return
            initial_prompt = box.initial_prompt

        await self._set_container_running(box_id)

        if initial_prompt:
            await self.send_message(box_id, initial_prompt)

        logger.info("Box %s started successfully", box_id)

    # ------------------------------------------------------------------
    # GitHub helpers
    # ------------------------------------------------------------------

    async def _get_github_token(self, github_installation_id: str | None) -> str:
        if self._github_service is None:
            raise RuntimeError("GitHub service not available")
        if not github_installation_id:
            raise RuntimeError("No GitHub installation ID for box")

        async with self._sf() as db:
            from codebox_orchestrator.db.models import GitHubInstallation
            installation = await db.get(GitHubInstallation, github_installation_id)
            if installation is None:
                raise RuntimeError(f"GitHub installation not found: {github_installation_id}")
            gh_installation_id = installation.installation_id

        return await self._github_service.get_installation_token(gh_installation_id)

    async def _run_github_setup(
        self,
        box_id: str,
        github_repo: str,
        github_branch: str,
        github_token: str,
        github_issue_number: int | None,
    ) -> None:
        if self._github_service is None:
            raise RuntimeError("GitHub service not available")

        setup_commands = self._github_service.build_setup_commands(
            repo=github_repo,
            branch=github_branch,
            token=github_token,
            issue_number=github_issue_number,
        )
        for cmd in setup_commands:
            await self.send_exec_and_wait(box_id, cmd, timeout=120.0)

    # ------------------------------------------------------------------
    # State updates
    # ------------------------------------------------------------------

    async def _set_container_running(self, box_id: str) -> None:
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box:
                box.container_status = ContainerStatus.RUNNING
                await db.commit()
        await self._relay.broadcast(
            box_id, {"type": "status_change", "container_status": ContainerStatus.RUNNING.value}
        )
        await self._global_broadcast.broadcast({
            "type": "box_status_changed",
            "box_id": box_id,
            "container_status": ContainerStatus.RUNNING.value,
        })

    async def _set_container_error(self, box_id: str, error: str) -> None:
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box:
                box.container_status = ContainerStatus.STOPPED
                box.stop_reason = "container_error"
                box.task_status = TaskStatus.IDLE
                box.completed_at = datetime.now(timezone.utc)
                await db.commit()
        await self._relay.broadcast(
            box_id, {
                "type": "status_change",
                "container_status": ContainerStatus.STOPPED.value,
                "stop_reason": "container_error",
            }
        )
        await self._relay.broadcast(
            box_id, {"type": "error", "detail": error}
        )
        await self._global_broadcast.broadcast({
            "type": "box_status_changed",
            "box_id": box_id,
            "container_status": ContainerStatus.STOPPED.value,
            "stop_reason": "container_error",
        })
