"""Box lifecycle service — background container orchestration."""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.box.domain.enums import Activity, ContainerStatus
from codebox_orchestrator.compute.domain.entities import ContainerConfig
from codebox_orchestrator.config import (
    CODEBOX_IMAGE,
    GITHUB_DEFAULT_BASE_BRANCH,
    OPENROUTER_API_KEY,
    ORCHESTRATOR_GRPC_ADDRESS,
    TAVILY_API_KEY,
    WORKSPACE_BASE_DIR,
)

if TYPE_CHECKING:
    from codebox_orchestrator.box.ports.agent_connection import AgentConnectionManager
    from codebox_orchestrator.box.ports.box_repository import BoxRepository
    from codebox_orchestrator.box.ports.container_runtime import ContainerRuntime
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)

_CALLBACK_TIMEOUT = 60.0
_FILE_OP_TIMEOUT = 10.0


class BoxLifecycleService:
    """Manages background container lifecycle for boxes."""

    def __init__(
        self,
        repo: BoxRepository,
        runtime: ContainerRuntime,
        connections: AgentConnectionManager,
        publisher: EventPublisher,
        send_message_fn,  # async callable(box_id, content) — injected to avoid circular dep
        send_exec_and_wait_fn,  # async callable(box_id, command, timeout) — injected
        create_callback_token_fn=None,  # callable(box_id, entity_type) -> str — injected
    ) -> None:
        self._repo = repo
        self._runtime = runtime
        self._connections = connections
        self._publisher = publisher
        self._send_message = send_message_fn
        self._send_exec_and_wait = send_exec_and_wait_fn
        self._create_callback_token = create_callback_token_fn
        self._running: dict[str, asyncio.Task[None]] = {}
        # Optional: set by composition root when GitHub integration is available
        self._github_service: Any = None

    def start_box(self, box_id: str) -> None:
        """Launch background lifecycle task for a box."""
        bg = asyncio.create_task(self._run_box(box_id))
        self._running[box_id] = bg

    def cancel_task(self, box_id: str) -> None:
        """Cancel the background lifecycle task if running."""
        bg = self._running.pop(box_id, None)
        if bg and not bg.done():
            bg.cancel()

    async def shutdown(self) -> None:
        """Cancel all running background tasks (called on app shutdown)."""
        for box_id in list(self._running):
            bg = self._running.pop(box_id, None)
            if bg and not bg.done():
                bg.cancel()
            box = await self._repo.get(box_id)
            if box and box.container_status != ContainerStatus.STOPPED:
                box.container_status = ContainerStatus.STOPPED
                box.container_stop_reason = "orchestrator_shutdown"
                box.activity = Activity.IDLE
                await self._repo.save(box)

    async def _run_box(self, box_id: str) -> None:
        """Background coroutine: spawn container, wait for callback."""
        try:
            await self._do_run_box(box_id)
        except asyncio.CancelledError:
            logger.info("Box %s was cancelled", box_id)
        except Exception as exc:
            logger.exception("Box %s failed", box_id)
            await self._set_container_error(box_id, str(exc))
        finally:
            self._running.pop(box_id, None)

    async def _do_run_box(self, box_id: str) -> None:
        box = await self._repo.get(box_id)
        if box is None:
            return

        is_github = bool(box.github_repo)

        # Create workspace directory (reuse existing for restarts)
        Path(WORKSPACE_BASE_DIR).mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
        if box.workspace_path and Path(box.workspace_path).is_dir():  # noqa: ASYNC240
            workspace = box.workspace_path
        else:
            workspace = tempfile.mkdtemp(prefix=f"box-{box_id[:8]}-", dir=WORKSPACE_BASE_DIR)

        # Generate JWT callback token
        callback_token = self._create_callback_token(box_id, "box")
        self._connections.init_connection_state(box_id)

        # Build container env vars
        container_name = f"codebox-box-{box_id[:8]}"
        extra_env: dict[str, str] = {
            "ORCHESTRATOR_GRPC_ADDRESS": ORCHESTRATOR_GRPC_ADDRESS,
            "CALLBACK_TOKEN": callback_token,
        }
        if box.dynamic_system_prompt:
            extra_env["DYNAMIC_SYSTEM_PROMPT"] = box.dynamic_system_prompt

        # For GitHub boxes, get installation token and inject env vars
        gh_token: str | None = None
        if is_github:
            sandbox_config = {
                "timeout": 300,
                "recursion_limit": 200,
                "temperature": 0,
            }
            extra_env["CODEBOX_SANDBOX_CONFIG"] = json.dumps(sandbox_config)
            extra_env["CODEBOX_GITHUB_REPO"] = box.github_repo or ""
            if box.github_branch:
                extra_env["CODEBOX_BRANCH"] = box.github_branch
            if box.github_issue_number is not None:
                extra_env["CODEBOX_GITHUB_ISSUE_NUMBER"] = str(box.github_issue_number)

            gh_token = await self._get_github_token(box.github_installation_id)
            extra_env["GH_TOKEN"] = gh_token
            extra_env["CODEBOX_GITHUB_REF"] = GITHUB_DEFAULT_BASE_BRANCH

        config = ContainerConfig(
            image=CODEBOX_IMAGE,
            name=container_name,
            model=box.model,
            api_key=OPENROUTER_API_KEY,
            tavily_api_key=TAVILY_API_KEY,
            mount_path=workspace,
            extra_env=extra_env,
        )

        try:
            info = self._runtime.spawn(config)
        except Exception as exc:
            await self._set_container_error(box_id, f"Failed to spawn container: {exc}")
            return

        # Update box with container info
        box.container_id = info.id
        box.container_name = info.name
        box.workspace_path = workspace
        await self._repo.save(box)

        # Wait for container to connect back via gRPC
        connected = await self._connections.wait_for_connection(box_id, timeout=_CALLBACK_TIMEOUT)
        if not connected:
            await self._set_container_error(box_id, "Container did not connect back in time")
            return

        # Run GitHub setup commands if needed
        if is_github and gh_token:
            try:
                await self._run_github_setup(
                    box_id=box_id,
                    github_repo=box.github_repo or "",
                    github_branch=box.github_branch or "",
                    github_token=gh_token,
                    github_issue_number=box.github_issue_number,
                )
            except Exception as exc:
                logger.exception("GitHub setup failed for box %s", box_id)
                await self._set_container_error(box_id, f"GitHub setup failed: {exc}")
                return

        # Mark as running
        await self._set_container_running(box_id)

        # Send initial prompt if set
        # Reload box to get latest initial_prompt
        box = await self._repo.get(box_id)
        if box and box.initial_prompt:
            await self._send_message(box_id, box.initial_prompt)

        logger.info("Box %s started successfully", box_id)

    async def _get_github_token(self, github_installation_id: str | None) -> str:
        if self._github_service is None:
            raise RuntimeError("GitHub service not available")
        if not github_installation_id:
            raise RuntimeError("No GitHub installation ID for box")

        # Look up the GitHub installation to get the numeric ID
        installation = await self._github_service.get_installation(github_installation_id)
        if installation is None:
            raise RuntimeError(f"GitHub installation not found: {github_installation_id}")

        return await self._github_service.get_token(installation.installation_id)

    async def _run_github_setup(
        self,
        box_id: str,
        github_repo: str,
        github_branch: str,
        github_token: str,
        github_issue_number: int | None,
    ) -> None:
        from codebox_orchestrator.integration.github.application.setup_commands import (  # noqa: PLC0415
            build_setup_commands,
        )

        setup_commands = build_setup_commands(
            repo=github_repo,
            branch=github_branch,
            token=github_token,
            issue_number=github_issue_number,
        )
        for cmd in setup_commands:
            await self._send_exec_and_wait(box_id, cmd, 120.0)

    async def _set_container_running(self, box_id: str) -> None:
        box = await self._repo.get(box_id)
        if box:
            box.mark_running()
            await self._repo.save(box)
        await self._publisher.publish_box_event(
            box_id, {"type": "status_change", "container_status": ContainerStatus.RUNNING.value}
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": ContainerStatus.RUNNING.value,
            }
        )

    async def _set_container_error(self, box_id: str, error: str) -> None:
        box = await self._repo.get(box_id)
        if box:
            box.stop("container_error")
            await self._repo.save(box)
        await self._publisher.publish_box_event(
            box_id,
            {
                "type": "status_change",
                "container_status": ContainerStatus.STOPPED.value,
                "container_stop_reason": "container_error",
            },
        )
        await self._publisher.publish_box_event(box_id, {"type": "error", "detail": error})
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": ContainerStatus.STOPPED.value,
                "container_stop_reason": "container_error",
            }
        )
