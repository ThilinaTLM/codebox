"""Sandbox lifecycle management — create, connect, and relay interactive sessions."""

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
    TAVILY_API_KEY,
    WORKSPACE_BASE_DIR,
)
from codebox_orchestrator.db.models import Sandbox, SandboxEvent, SandboxStatus
from codebox_orchestrator.services import docker_service
from codebox_orchestrator.services.relay_service import RelayService
from codebox_orchestrator.services.sandbox_client import SandboxClient

logger = logging.getLogger(__name__)


class SandboxService:
    """Orchestrates sandbox creation, container lifecycle, and event relay."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        relay: RelayService,
    ) -> None:
        self._sf = session_factory
        self._relay = relay
        # Background relay loops keyed by sandbox_id
        self._running: dict[str, asyncio.Task[None]] = {}
        # Active WS connections to sandbox containers
        self._ws_connections: dict[str, Any] = {}
        # Cached SandboxClient instances
        self._clients: dict[str, SandboxClient] = {}

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
        # Cancel relay loop
        bg = self._running.pop(sandbox_id, None)
        if bg and not bg.done():
            bg.cancel()

        # Close WS connection
        ws = self._ws_connections.pop(sandbox_id, None)
        if ws:
            try:
                await ws.close()
            except Exception:
                pass

        self._clients.pop(sandbox_id, None)

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
    # Commands (forward to sandbox WS)
    # ------------------------------------------------------------------

    async def send_message(self, sandbox_id: str, content: str) -> None:
        """Send a chat message to the sandbox agent."""
        ws = self._ws_connections.get(sandbox_id)
        if ws is None:
            raise ValueError("No active WebSocket connection for this sandbox")
        await SandboxClient.send_message(ws, content)

    async def send_exec(self, sandbox_id: str, command: str) -> None:
        """Send a shell command for direct execution in the sandbox."""
        ws = self._ws_connections.get(sandbox_id)
        if ws is None:
            raise ValueError("No active WebSocket connection for this sandbox")
        await SandboxClient.send_exec(ws, command)

    async def send_cancel(self, sandbox_id: str) -> None:
        """Cancel the current operation in the sandbox."""
        ws = self._ws_connections.get(sandbox_id)
        if ws is None:
            raise ValueError("No active WebSocket connection for this sandbox")
        await SandboxClient.send_cancel(ws)

    # ------------------------------------------------------------------
    # File browsing (REST proxy)
    # ------------------------------------------------------------------

    async def list_files(self, sandbox_id: str, path: str = "/workspace") -> dict[str, Any]:
        """List files in the sandbox workspace."""
        client = await self._get_client(sandbox_id)
        return await asyncio.to_thread(client.list_files, path)

    async def read_file(self, sandbox_id: str, path: str) -> dict[str, Any]:
        """Read a file from the sandbox workspace."""
        client = await self._get_client(sandbox_id)
        return await asyncio.to_thread(client.read_file, path)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def shutdown(self) -> None:
        """Cancel all running relay loops (called on app shutdown)."""
        for sandbox_id in list(self._running):
            bg = self._running.pop(sandbox_id, None)
            if bg and not bg.done():
                bg.cancel()

    async def _start_sandbox(self, sandbox_id: str) -> None:
        """Background coroutine: spawn container, connect, start relay."""
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

        # Spawn container
        container_name = f"codebox-sandbox-{sandbox_id[:8]}"
        try:
            info = docker_service.spawn(
                image=CODEBOX_IMAGE,
                name=container_name,
                model=model,
                api_key=OPENROUTER_API_KEY,
                tavily_api_key=TAVILY_API_KEY,
                mount_path=workspace,
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
            sandbox.host_port = info.port
            sandbox.workspace_path = workspace
            await db.commit()

        # Wait for daemon health
        healthy = await asyncio.to_thread(
            docker_service.wait_for_healthy, container_name
        )
        if not healthy:
            await self._set_failed(sandbox_id, "Sandbox daemon did not become healthy in time")
            return

        # Get auth token
        try:
            token = await asyncio.to_thread(docker_service.get_token, container_name)
        except docker_service.DockerServiceError as exc:
            await self._set_failed(sandbox_id, f"Failed to get token: {exc}")
            return

        # Create sandbox client and session
        client = SandboxClient(host=container_name, port=CODEBOX_PORT, token=token)
        try:
            session_info = client.create_session(
                model=model,
                api_key=OPENROUTER_API_KEY,
            )
        except Exception as exc:
            await self._set_failed(sandbox_id, f"Failed to create session: {exc}")
            return

        session_id = session_info["session_id"]

        # Update sandbox with session and auth info, mark ready
        async with self._sf() as db:
            sandbox = await db.get(Sandbox, sandbox_id)
            if sandbox is None:
                return
            sandbox.session_id = session_id
            sandbox.auth_token = token
            sandbox.status = SandboxStatus.READY
            await db.commit()

        self._clients[sandbox_id] = client

        await self._relay.broadcast(
            sandbox_id, {"type": "status_change", "status": SandboxStatus.READY.value}
        )

        # Connect WS and start relay loop (stays open indefinitely)
        try:
            ws = await client.connect_session(session_id)
        except Exception as exc:
            await self._set_failed(sandbox_id, f"Failed to connect WebSocket: {exc}")
            return

        self._ws_connections[sandbox_id] = ws

        # Relay loop — does NOT terminate on "done" events
        try:
            async for event in SandboxClient.receive_events(ws):
                event_type = event.get("type", "")

                # Persist event
                await self._persist_event(sandbox_id, event_type, event)

                # Broadcast to subscribers
                await self._relay.broadcast(sandbox_id, event)

                # Only terminate on error (sandbox container issue)
                if event_type == "error":
                    detail = event.get("detail", "")
                    # Don't terminate on agent-level errors (e.g. invalid message)
                    # Only on fatal connection issues
                    if "WebSocket" in detail or "connection" in detail.lower():
                        break

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Sandbox %s relay loop error: %s", sandbox_id, exc)
        finally:
            try:
                await ws.close()
            except Exception:
                pass
            self._ws_connections.pop(sandbox_id, None)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _get_client(self, sandbox_id: str) -> SandboxClient:
        """Get or create a SandboxClient for REST calls."""
        if sandbox_id in self._clients:
            return self._clients[sandbox_id]

        async with self._sf() as db:
            sandbox = await db.get(Sandbox, sandbox_id)
            if sandbox is None:
                raise ValueError(f"Sandbox not found: {sandbox_id}")
            if not sandbox.container_name or not sandbox.auth_token:
                raise ValueError(f"Sandbox {sandbox_id} is not ready")

            client = SandboxClient(
                host=sandbox.container_name,
                port=CODEBOX_PORT,
                token=sandbox.auth_token,
            )
            self._clients[sandbox_id] = client
            return client

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

    async def _persist_event(
        self, sandbox_id: str, event_type: str, data: dict[str, Any]
    ) -> None:
        async with self._sf() as db:
            ev = SandboxEvent(
                sandbox_id=sandbox_id,
                event_type=event_type,
                data=json.dumps(data),
            )
            db.add(ev)
            await db.commit()
