"""Sandbox lifecycle management — create, connect, and relay interactive sessions."""

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
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    ORCHESTRATOR_CALLBACK_URL,
    TAVILY_API_KEY,
    WORKSPACE_BASE_DIR,
)
from codebox_orchestrator.db.models import Sandbox, SandboxEvent, SandboxStatus
from codebox_orchestrator.services import docker_service
from codebox_orchestrator.services.callback_registry import CallbackRegistry
from codebox_orchestrator.services.relay_service import RelayService

logger = logging.getLogger(__name__)

_CALLBACK_TIMEOUT = 60.0  # seconds to wait for sandbox to connect back
_FILE_OP_TIMEOUT = 10.0  # seconds to wait for file operation responses


class SandboxService:
    """Orchestrates sandbox creation, container lifecycle, and event relay."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        relay: RelayService,
        registry: CallbackRegistry,
    ) -> None:
        self._sf = session_factory
        self._relay = relay
        self._registry = registry
        # Background tasks keyed by sandbox_id (timeout watchers)
        self._running: dict[str, asyncio.Task[None]] = {}

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create_sandbox(
        self,
        name: str | None = None,
        model: str | None = None,
    ) -> Sandbox:
        """Create a sandbox record and start spawning its container."""
        sandbox = Sandbox(
            name=name or "sandbox",
            model=model or OPENROUTER_MODEL,
        )
        async with self._sf() as db:
            db.add(sandbox)
            await db.commit()
            await db.refresh(sandbox)

        # Start container in background
        bg = asyncio.create_task(self._start_sandbox(sandbox.id))
        self._running[sandbox.id] = bg
        return sandbox

    async def get_sandbox(self, sandbox_id: str) -> Sandbox | None:
        async with self._sf() as db:
            return await db.get(Sandbox, sandbox_id)

    async def list_sandboxes(self) -> list[Sandbox]:
        async with self._sf() as db:
            stmt = select(Sandbox).order_by(Sandbox.created_at.desc())
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def get_sandbox_events(self, sandbox_id: str) -> list[SandboxEvent]:
        async with self._sf() as db:
            stmt = (
                select(SandboxEvent)
                .where(SandboxEvent.sandbox_id == sandbox_id)
                .order_by(SandboxEvent.id)
            )
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def stop_sandbox(self, sandbox_id: str) -> None:
        """Stop a sandbox and its container."""
        # Cancel background task
        bg = self._running.pop(sandbox_id, None)
        if bg and not bg.done():
            bg.cancel()

        # Close callback WS connection
        ws = self._registry.get_connection(sandbox_id)
        if ws:
            try:
                await ws.close()
            except Exception:
                pass
        self._registry.remove(sandbox_id)

        async with self._sf() as db:
            sandbox = await db.get(Sandbox, sandbox_id)
            if sandbox and sandbox.status in (SandboxStatus.STARTING, SandboxStatus.READY):
                sandbox.status = SandboxStatus.STOPPED
                sandbox.stopped_at = datetime.now(timezone.utc)
                await db.commit()
                # Stop the container
                if sandbox.container_name:
                    try:
                        docker_service.stop(sandbox.container_name)
                    except Exception:
                        pass
                await self._relay.broadcast(
                    sandbox_id, {"type": "status_change", "status": SandboxStatus.STOPPED.value}
                )

    async def delete_sandbox(self, sandbox_id: str) -> None:
        """Stop and delete sandbox, including container and DB record."""
        await self.stop_sandbox(sandbox_id)
        async with self._sf() as db:
            sandbox = await db.get(Sandbox, sandbox_id)
            if sandbox:
                if sandbox.container_name:
                    try:
                        docker_service.remove(sandbox.container_name)
                    except Exception:
                        pass
                await db.delete(sandbox)
                await db.commit()

    # ------------------------------------------------------------------
    # Commands (forward to sandbox via callback WS)
    # ------------------------------------------------------------------

    async def send_message(self, sandbox_id: str, content: str) -> None:
        """Send a chat message to the sandbox agent."""
        ws = self._registry.get_connection(sandbox_id)
        if ws is None:
            raise ValueError("No active connection for this sandbox")
        await ws.send_json({"type": "message", "content": content})

    async def send_exec(self, sandbox_id: str, command: str) -> None:
        """Send a shell command for direct execution in the sandbox."""
        ws = self._registry.get_connection(sandbox_id)
        if ws is None:
            raise ValueError("No active connection for this sandbox")
        await ws.send_json({"type": "exec", "content": command})

    async def send_cancel(self, sandbox_id: str) -> None:
        """Cancel the current operation in the sandbox."""
        ws = self._registry.get_connection(sandbox_id)
        if ws is None:
            raise ValueError("No active connection for this sandbox")
        await ws.send_json({"type": "cancel"})

    # ------------------------------------------------------------------
    # File browsing (via callback WS)
    # ------------------------------------------------------------------

    async def list_files(self, sandbox_id: str, path: str = "/workspace") -> dict[str, Any]:
        """List files in the sandbox workspace."""
        ws = self._registry.get_connection(sandbox_id)
        if ws is None:
            raise ValueError("No active connection for this sandbox")
        request_id, fut = self._registry.create_pending_request(sandbox_id)
        await ws.send_json({"type": "list_files", "path": path, "request_id": request_id})
        result = await asyncio.wait_for(fut, timeout=_FILE_OP_TIMEOUT)
        if "error" in result:
            raise RuntimeError(result["error"])
        return result.get("data", {})

    async def read_file(self, sandbox_id: str, path: str) -> dict[str, Any]:
        """Read a file from the sandbox workspace."""
        ws = self._registry.get_connection(sandbox_id)
        if ws is None:
            raise ValueError("No active connection for this sandbox")
        request_id, fut = self._registry.create_pending_request(sandbox_id)
        await ws.send_json({"type": "read_file", "path": path, "request_id": request_id})
        result = await asyncio.wait_for(fut, timeout=_FILE_OP_TIMEOUT)
        if "error" in result:
            raise RuntimeError(result["error"])
        return result.get("data", {})

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def shutdown(self) -> None:
        """Cancel all running tasks (called on app shutdown)."""
        for sandbox_id in list(self._running):
            bg = self._running.pop(sandbox_id, None)
            if bg and not bg.done():
                bg.cancel()

    async def _start_sandbox(self, sandbox_id: str) -> None:
        """Background coroutine: spawn container and wait for callback."""
        try:
            await self._do_start_sandbox(sandbox_id)
        except asyncio.CancelledError:
            logger.info("Sandbox %s startup cancelled", sandbox_id)
        except Exception as exc:
            logger.exception("Sandbox %s failed to start: %s", sandbox_id, exc)
            await self._set_failed(sandbox_id, str(exc))
        finally:
            self._running.pop(sandbox_id, None)

    async def _do_start_sandbox(self, sandbox_id: str) -> None:
        # Load sandbox
        async with self._sf() as db:
            sandbox = await db.get(Sandbox, sandbox_id)
            if sandbox is None:
                return
            model = sandbox.model

        await self._relay.broadcast(
            sandbox_id, {"type": "status_change", "status": SandboxStatus.STARTING.value}
        )

        # Create workspace directory
        os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
        workspace = tempfile.mkdtemp(prefix=f"sandbox-{sandbox_id[:8]}-", dir=WORKSPACE_BASE_DIR)

        # Generate callback token
        callback_token = secrets.token_urlsafe(32)
        self._registry.register(callback_token, sandbox_id, "sandbox")

        # Spawn container with callback env vars
        container_name = f"codebox-sandbox-{sandbox_id[:8]}"
        try:
            info = docker_service.spawn(
                image=CODEBOX_IMAGE,
                name=container_name,
                model=model,
                api_key=OPENROUTER_API_KEY,
                tavily_api_key=TAVILY_API_KEY,
                mount_path=workspace,
                extra_env={
                    "ORCHESTRATOR_CALLBACK_URL": ORCHESTRATOR_CALLBACK_URL,
                    "CALLBACK_TOKEN": callback_token,
                },
            )
        except docker_service.DockerServiceError as exc:
            await self._set_failed(sandbox_id, f"Failed to spawn container: {exc}")
            return

        # Update sandbox with container info
        async with self._sf() as db:
            sandbox = await db.get(Sandbox, sandbox_id)
            if sandbox is None:
                return
            sandbox.container_id = info.id
            sandbox.container_name = info.name
            sandbox.callback_token = callback_token
            sandbox.workspace_path = workspace
            await db.commit()

        # Wait for the sandbox to connect back
        connected = await self._registry.wait_for_connection(sandbox_id, timeout=_CALLBACK_TIMEOUT)
        if not connected:
            await self._set_failed(sandbox_id, "Sandbox did not connect back in time")
            return

        # Sandbox is now READY (status updated by ws_callback endpoint)
        logger.info("Sandbox %s started successfully", sandbox_id)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _set_failed(self, sandbox_id: str, error: str) -> None:
        async with self._sf() as db:
            sandbox = await db.get(Sandbox, sandbox_id)
            if sandbox:
                sandbox.status = SandboxStatus.FAILED
                sandbox.error_message = error
                sandbox.stopped_at = datetime.now(timezone.utc)
                await db.commit()
        await self._relay.broadcast(
            sandbox_id, {"type": "status_change", "status": SandboxStatus.FAILED.value}
        )
        await self._relay.broadcast(
            sandbox_id, {"type": "error", "detail": error}
        )
