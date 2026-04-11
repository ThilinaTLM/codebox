"""Box lifecycle service — background container orchestration.

The orchestrator no longer stores box state in its database. This service
spawns containers with metadata labels and coordinates gRPC connection.
"""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.compute.domain.entities import ContainerConfig
from codebox_orchestrator.config import (
    CODEBOX_IMAGE,
    GITHUB_DEFAULT_BASE_BRANCH,
    LLM_API_KEY,
    LLM_BASE_URL,
    ORCHESTRATOR_GRPC_ADDRESS,
    TAVILY_API_KEY,
    get_workspace_base_dir,
)

if TYPE_CHECKING:
    from codebox_orchestrator.box.infrastructure.box_state_store import BoxStateStore
    from codebox_orchestrator.box.ports.agent_connection import AgentConnectionManager
    from codebox_orchestrator.box.ports.container_runtime import ContainerRuntime
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher

logger = logging.getLogger(__name__)

_CALLBACK_TIMEOUT = 60.0


class BoxLifecycleService:
    """Manages background container lifecycle for boxes."""

    def __init__(
        self,
        runtime: ContainerRuntime,
        connections: AgentConnectionManager,
        publisher: EventPublisher,
        state_store: BoxStateStore,
        send_exec_and_wait_fn,  # async callable(box_id, command, timeout) — injected
        create_callback_token_fn=None,  # callable(box_id, entity_type) -> str — injected
    ) -> None:
        self._runtime = runtime
        self._connections = connections
        self._publisher = publisher
        self._state_store = state_store
        self._send_exec_and_wait = send_exec_and_wait_fn
        self._create_callback_token = create_callback_token_fn
        self._running: dict[str, asyncio.Task[None]] = {}
        # Optional: set by composition root when GitHub integration is available
        self._github_service: Any = None

    def start_box(
        self,
        *,
        box_id: str,
        name: str,
        provider: str,
        model: str,
        dynamic_system_prompt: str | None = None,
        initial_prompt: str | None = None,
        trigger: str | None = None,
        github_installation_id: str | None = None,
        github_repo: str | None = None,
        github_issue_number: int | None = None,
        github_trigger_url: str | None = None,
        github_branch: str | None = None,
    ) -> None:
        """Launch background lifecycle task for a box."""
        bg = asyncio.create_task(
            self._run_box(
                box_id=box_id,
                name=name,
                provider=provider,
                model=model,
                dynamic_system_prompt=dynamic_system_prompt,
                initial_prompt=initial_prompt,
                trigger=trigger,
                github_installation_id=github_installation_id,
                github_repo=github_repo,
                github_issue_number=github_issue_number,
                github_trigger_url=github_trigger_url,
                github_branch=github_branch,
            )
        )
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

    async def _run_box(self, **kwargs) -> None:
        """Background coroutine: spawn container, wait for callback."""
        box_id = kwargs["box_id"]
        try:
            await self._do_run_box(**kwargs)
        except asyncio.CancelledError:
            logger.info("Box %s was cancelled", box_id)
        except Exception as exc:
            logger.exception("Box %s failed", box_id)
            await self._broadcast_error(box_id, str(exc))
        finally:
            self._running.pop(box_id, None)

    async def _do_run_box(  # noqa: PLR0912
        self,
        *,
        box_id: str,
        name: str,
        provider: str,
        model: str,
        dynamic_system_prompt: str | None = None,
        initial_prompt: str | None = None,
        trigger: str | None = None,
        github_installation_id: str | None = None,
        github_repo: str | None = None,
        github_issue_number: int | None = None,
        github_trigger_url: str | None = None,
        github_branch: str | None = None,
    ) -> None:
        is_github = bool(github_repo)

        # Create workspace directory
        workspace_base_dir = get_workspace_base_dir()
        workspace = tempfile.mkdtemp(prefix=f"box-{box_id[:8]}-", dir=workspace_base_dir)

        # Generate JWT callback token
        callback_token = self._create_callback_token(box_id, "box")
        self._connections.init_connection_state(box_id)

        # Build container env vars
        container_name = f"codebox-box-{box_id[:8]}"
        extra_env: dict[str, str] = {
            "ORCHESTRATOR_GRPC_ADDRESS": ORCHESTRATOR_GRPC_ADDRESS,
            "CALLBACK_TOKEN": callback_token,
        }
        if dynamic_system_prompt:
            extra_env["DYNAMIC_SYSTEM_PROMPT"] = dynamic_system_prompt
        if initial_prompt:
            extra_env["INITIAL_PROMPT"] = initial_prompt

        # Build metadata labels
        extra_labels: dict[str, str] = {
            "codebox.box-id": box_id,
            "codebox.name": name,
            "codebox.provider": provider,
            "codebox.model": model,
            "codebox.trigger": trigger or "manual",
            "codebox.created-at": datetime.now(UTC).isoformat(),
        }
        if github_repo:
            extra_labels["codebox.github-repo"] = github_repo
        if github_branch:
            extra_labels["codebox.github-branch"] = github_branch
        if github_issue_number is not None:
            extra_labels["codebox.github-issue-number"] = str(github_issue_number)
        if github_trigger_url:
            extra_labels["codebox.github-trigger-url"] = github_trigger_url

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

        config = ContainerConfig(
            image=CODEBOX_IMAGE,
            name=container_name,
            provider=provider,
            model=model,
            api_key=LLM_API_KEY,
            base_url=LLM_BASE_URL or None,
            tavily_api_key=TAVILY_API_KEY,
            mount_path=workspace,
            extra_env=extra_env,
            extra_labels=extra_labels,
        )

        try:
            self._runtime.spawn(config)
        except Exception as exc:
            await self._broadcast_error(box_id, f"Failed to spawn container: {exc}")
            return

        self._state_store.mark_spawned(box_id)

        # Wait for container to connect back via gRPC
        connected = await self._connections.wait_for_connection(box_id, timeout=_CALLBACK_TIMEOUT)
        if not connected:
            await self._broadcast_error(box_id, "Container did not connect back in time")
            return

        # Run GitHub setup commands if needed
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
                await self._broadcast_error(box_id, f"GitHub setup failed: {exc}")
                return

        # Mark as running via SSE broadcast
        await self._publisher.publish_box_event(
            box_id, {"type": "status_change", "container_status": "running"}
        )
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": "running",
            }
        )

        logger.info("Box %s started successfully", box_id)

    async def _get_github_token(self, github_installation_id: str | None) -> str:
        if self._github_service is None:
            raise RuntimeError("GitHub service not available")
        if not github_installation_id:
            raise RuntimeError("No GitHub installation ID for box")

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

    async def _broadcast_error(self, box_id: str, error: str) -> None:
        self._state_store.set_error(box_id, error)
        await self._publisher.publish_box_event(
            box_id,
            {
                "type": "status_change",
                "container_status": "stopped",
                "container_stop_reason": "container_error",
            },
        )
        await self._publisher.publish_box_event(box_id, {"type": "error", "detail": error})
        await self._publisher.publish_global_event(
            {
                "type": "box_status_changed",
                "box_id": box_id,
                "container_status": "stopped",
                "container_stop_reason": "container_error",
                "error_detail": error,
            }
        )
