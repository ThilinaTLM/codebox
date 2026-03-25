"""Box lifecycle management — create, start, stop, and relay events."""

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
    GITHUB_DEFAULT_BASE_BRANCH,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    ORCHESTRATOR_CALLBACK_URL,
    TAVILY_API_KEY,
    WORKSPACE_BASE_DIR,
)
from codebox_orchestrator.db.models import Box, BoxEvent, BoxStatus
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
        auto_stop: bool | None = None,
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
            system_prompt=system_prompt,
            initial_prompt=initial_prompt,
            auto_stop=auto_stop if auto_stop is not None else bool(trigger),
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
            box.id, {"type": "status_change", "status": BoxStatus.STARTING.value}
        )
        await self._global_broadcast.broadcast({
            "type": "box_created",
            "box_id": box.id,
            "name": box.name,
            "status": BoxStatus.STARTING.value,
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
        status: BoxStatus | None = None,
        trigger: str | None = None,
    ) -> list[Box]:
        async with self._sf() as db:
            stmt = select(Box).order_by(Box.created_at.desc())
            if status is not None:
                stmt = stmt.where(Box.status == status)
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

        ws = self._registry.get_connection(box_id)
        if ws:
            try:
                await ws.close()
            except Exception:
                pass
        self._registry.remove_fully(box_id)

        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box and box.status in (
                BoxStatus.STARTING,
                BoxStatus.RUNNING,
                BoxStatus.IDLE,
            ):
                box.status = BoxStatus.STOPPED
                box.completed_at = datetime.now(timezone.utc)
                await db.commit()
                if box.container_name:
                    try:
                        docker_service.stop(box.container_name)
                    except Exception:
                        pass
                await self._relay.broadcast(
                    box_id, {"type": "status_change", "status": BoxStatus.STOPPED.value}
                )
                await self._global_broadcast.broadcast({
                    "type": "box_status_changed",
                    "box_id": box_id,
                    "status": BoxStatus.STOPPED.value,
                })

    async def cancel_box(self, box_id: str) -> None:
        """Cancel a running box operation."""
        # Send cancel over callback WS
        ws = self._registry.get_connection(box_id)
        if ws:
            try:
                await ws.send_json({"type": "cancel"})
            except Exception:
                pass

    async def send_message(self, box_id: str, content: str) -> None:
        """Send a chat message to the box agent."""
        ws = self._registry.get_connection(box_id)
        if ws is None:
            raise ValueError("No active connection for this box")
        await ws.send_json({"type": "message", "content": content})

    async def send_exec(self, box_id: str, command: str) -> None:
        """Send a shell command for direct execution."""
        ws = self._registry.get_connection(box_id)
        if ws is None:
            raise ValueError("No active connection for this box")
        await ws.send_json({"type": "exec", "content": command})

    async def send_cancel(self, box_id: str) -> None:
        """Cancel the current operation."""
        ws = self._registry.get_connection(box_id)
        if ws is None:
            raise ValueError("No active connection for this box")
        await ws.send_json({"type": "cancel"})

    # ------------------------------------------------------------------
    # File browsing (via callback WS)
    # ------------------------------------------------------------------

    async def list_files(self, box_id: str, path: str = "") -> dict[str, Any]:
        ws = self._registry.get_connection(box_id)
        if ws is None:
            raise ValueError("No active connection for this box")
        request_id, fut = self._registry.create_pending_request(box_id)
        await ws.send_json({"type": "list_files", "path": path, "request_id": request_id})
        result = await asyncio.wait_for(fut, timeout=_FILE_OP_TIMEOUT)
        if "error" in result:
            raise RuntimeError(result["error"])
        return result.get("data", {})

    async def read_file(self, box_id: str, path: str) -> dict[str, Any]:
        ws = self._registry.get_connection(box_id)
        if ws is None:
            raise ValueError("No active connection for this box")
        request_id, fut = self._registry.create_pending_request(box_id)
        await ws.send_json({"type": "read_file", "path": path, "request_id": request_id})
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
            await self._set_failed(box_id, str(exc))
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
            github_repo = box.github_repo
            github_branch = box.github_branch
            github_issue_number = box.github_issue_number
            github_installation_id = box.github_installation_id

        is_github = bool(github_repo)

        # Create workspace directory
        os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
        workspace = tempfile.mkdtemp(prefix=f"box-{box_id[:8]}-", dir=WORKSPACE_BASE_DIR)

        # Generate JWT callback token
        from codebox_orchestrator.services.callback_token import create_callback_token
        callback_token = create_callback_token(box_id, entity_type="box")
        self._registry.init_connection_state(box_id)

        # Build container env vars
        container_name = f"codebox-box-{box_id[:8]}"
        extra_env: dict[str, str] = {
            "ORCHESTRATOR_CALLBACK_URL": ORCHESTRATOR_CALLBACK_URL,
            "CALLBACK_TOKEN": callback_token,
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
            await self._set_failed(box_id, f"Failed to spawn container: {exc}")
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
            await self._set_failed(box_id, "Container did not connect back in time")
            return

        # Run pre-start setup commands for GitHub boxes
        if is_github and gh_token:
            try:
                await self._run_github_setup(
                    container_name=info.name,
                    box_id=box_id,
                    github_repo=github_repo or "",
                    github_branch=github_branch or "",
                    github_token=gh_token,
                    github_issue_number=github_issue_number,
                )
            except Exception as exc:
                logger.exception("GitHub setup failed for box %s", box_id)
                await self._set_failed(box_id, f"GitHub setup failed: {exc}")
                return

        # Signal that setup is done — ws_callback can now send the prompt
        self._registry.set_prompt_ready(box_id)
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
        container_name: str,
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
        docker_service.exec_commands(container_name, setup_commands)

    # ------------------------------------------------------------------
    # State updates
    # ------------------------------------------------------------------

    async def _set_failed(self, box_id: str, error: str) -> None:
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box:
                box.status = BoxStatus.FAILED
                box.error_message = error
                box.completed_at = datetime.now(timezone.utc)
                await db.commit()
        await self._relay.broadcast(
            box_id, {"type": "status_change", "status": BoxStatus.FAILED.value}
        )
        await self._relay.broadcast(
            box_id, {"type": "error", "detail": error}
        )
        await self._global_broadcast.broadcast({
            "type": "box_status_changed",
            "box_id": box_id,
            "status": BoxStatus.FAILED.value,
        })
