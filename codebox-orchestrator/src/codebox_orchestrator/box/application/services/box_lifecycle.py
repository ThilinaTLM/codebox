"""Box lifecycle service — background container orchestration.

The orchestrator no longer stores box state in its database. This service
spawns containers with metadata labels and coordinates gRPC connection.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from codebox_orchestrator.compute.domain.entities import ContainerConfig
from codebox_orchestrator.config import (
    CODEBOX_IMAGE,
    GRPC_TLS_CA_CERT,
    ORCHESTRATOR_GRPC_PUBLIC_URL,
    ORCHESTRATOR_WS_PUBLIC_URL,
)
from codebox_orchestrator.shared.urls import compose_tunnel_url, normalize_grpc_url

if TYPE_CHECKING:
    from codebox_orchestrator.box.infrastructure.box_state_store import BoxStateStore
    from codebox_orchestrator.box.ports.agent_connection import AgentConnectionManager
    from codebox_orchestrator.box.ports.event_publisher import EventPublisher
    from codebox_orchestrator.compute.application.commands import (
        ProvisionContainerHandler,
    )

logger = logging.getLogger(__name__)

_CALLBACK_TIMEOUT = 60.0


class BoxLifecycleService:
    """Manages background container lifecycle for boxes."""

    def __init__(
        self,
        provision_container: ProvisionContainerHandler,
        connections: AgentConnectionManager,
        publisher: EventPublisher,
        state_store: BoxStateStore,
        send_exec_and_wait_fn,  # async callable(box_id, command, timeout) — injected
        create_callback_token_fn=None,  # callable(box_id, entity_type) -> str — injected
    ) -> None:
        self._provision_container = provision_container
        self._connections = connections
        self._publisher = publisher
        self._state_store = state_store
        self._send_exec_and_wait = send_exec_and_wait_fn
        self._create_callback_token = create_callback_token_fn
        self._running: dict[str, asyncio.Task[None]] = {}
        # Optional: set by composition root for per-user GitHub integration
        self._github_client_manager: Any = None

    def start_box(
        self,
        *,
        box_id: str,
        name: str,
        description: str | None = None,
        tags: list[str] | None = None,
        provider: str,
        model: str,
        api_key: str = "",
        base_url: str | None = None,
        tavily_api_key: str | None = None,
        system_prompt: str | None = None,
        auto_start_prompt: str | None = None,
        recursion_limit: int | None = None,
        tool_settings: dict[str, Any] | None = None,
        trigger: str | None = None,
        github_installation_id: str | None = None,
        github_repo: str | None = None,
        github_issue_number: int | None = None,
        github_trigger_url: str | None = None,
        github_branch: str | None = None,
        init_bash_script: str | None = None,
        project_id: str = "",
    ) -> None:
        """Launch background lifecycle task for a box."""
        bg = asyncio.create_task(
            self._run_box(
                box_id=box_id,
                name=name,
                description=description,
                tags=tags,
                provider=provider,
                model=model,
                api_key=api_key,
                base_url=base_url,
                tavily_api_key=tavily_api_key,
                system_prompt=system_prompt,
                auto_start_prompt=auto_start_prompt,
                recursion_limit=recursion_limit,
                tool_settings=tool_settings,
                trigger=trigger,
                github_installation_id=github_installation_id,
                github_repo=github_repo,
                github_issue_number=github_issue_number,
                github_trigger_url=github_trigger_url,
                github_branch=github_branch,
                init_bash_script=init_bash_script,
                project_id=project_id,
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

    async def _do_run_box(  # noqa: PLR0912, PLR0915
        self,
        *,
        box_id: str,
        name: str,
        description: str | None = None,
        tags: list[str] | None = None,
        provider: str,
        model: str,
        api_key: str = "",
        base_url: str | None = None,
        tavily_api_key: str | None = None,
        system_prompt: str | None = None,
        auto_start_prompt: str | None = None,
        recursion_limit: int | None = None,
        tool_settings: dict[str, Any] | None = None,
        trigger: str | None = None,
        github_installation_id: str | None = None,
        github_repo: str | None = None,
        github_issue_number: int | None = None,
        github_trigger_url: str | None = None,
        github_branch: str | None = None,
        init_bash_script: str | None = None,
        project_id: str = "",
    ) -> None:
        is_github = bool(github_repo)

        # Generate JWT callback token
        callback_token = self._create_callback_token(box_id, "box")
        self._connections.init_connection_state(box_id)

        # Build container env vars
        container_name = f"codebox-box-{box_id[:8]}"
        extra_env: dict[str, str] = {
            "ORCHESTRATOR_GRPC_ADDRESS": normalize_grpc_url(ORCHESTRATOR_GRPC_PUBLIC_URL),
            "ORCHESTRATOR_TUNNEL_URL": compose_tunnel_url(ORCHESTRATOR_WS_PUBLIC_URL),
            "CALLBACK_TOKEN": callback_token,
        }
        if auto_start_prompt:
            extra_env["INITIAL_PROMPT"] = auto_start_prompt

        # ── Build CODEBOX_AGENT_CONFIG ───────────────────────────��──
        agent_config: dict[str, Any] = {
            "llm": {
                "provider": provider,
                "model": model,
                "api_key": api_key,
                "base_url": base_url or None,
            },
            "recursion_limit": recursion_limit or (200 if is_github else 150),
        }
        if system_prompt:
            agent_config["system_prompt"] = system_prompt

        # Merge tool settings from caller + inject user's Tavily key
        tools_dict: dict[str, Any] = dict(tool_settings) if tool_settings else {}
        if tavily_api_key:
            ws = dict(tools_dict.get("web_search") or {})
            ws.setdefault("api_key", tavily_api_key)
            tools_dict["web_search"] = ws
        if is_github:
            # GitHub boxes get a longer default execute timeout
            ex = dict(tools_dict.get("execute") or {})
            ex.setdefault("timeout", 300)
            tools_dict["execute"] = ex
        if tools_dict:
            agent_config["tools"] = tools_dict

        extra_env["CODEBOX_AGENT_CONFIG"] = json.dumps(agent_config)

        # Inject gRPC TLS CA cert path for sandbox-side verification
        if GRPC_TLS_CA_CERT:
            extra_env["GRPC_TLS_CA_CERT"] = "/etc/grpc-certs/ca.crt"

        # Build metadata labels
        extra_labels: dict[str, str] = {
            "codebox.box-id": box_id,
            "codebox.name": name,
            "codebox.provider": provider,
            "codebox.model": model,
            "codebox.trigger": trigger or "manual",
            "codebox.created-at": datetime.now(UTC).isoformat(),
        }
        if project_id:
            extra_labels["codebox.project-id"] = project_id
        if description:
            extra_labels["codebox.description"] = description
        if tags:
            extra_labels["codebox.tags"] = ",".join(tags)
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
            extra_env["CODEBOX_GITHUB_REPO"] = github_repo or ""
            if github_branch:
                extra_env["CODEBOX_BRANCH"] = github_branch
            if github_issue_number is not None:
                extra_env["CODEBOX_GITHUB_ISSUE_NUMBER"] = str(github_issue_number)

            gh_token = await self._get_github_token(github_installation_id, project_id)
            extra_env["GH_TOKEN"] = gh_token
            github_base_branch = await self._get_github_default_branch(project_id)
            extra_env["CODEBOX_GITHUB_REF"] = github_base_branch

        # Build certificate volume mounts for gRPC TLS
        cert_mounts: dict[str, dict[str, str]] = {}
        if GRPC_TLS_CA_CERT:
            cert_mounts[GRPC_TLS_CA_CERT] = {"bind": "/etc/grpc-certs/ca.crt", "mode": "ro"}

        config = ContainerConfig(
            image=CODEBOX_IMAGE,
            name=container_name,
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url or None,
            tavily_api_key=tavily_api_key,
            extra_env=extra_env,
            extra_labels=extra_labels,
            cert_mounts=cert_mounts,
        )

        try:
            await self._provision_container.execute(config)
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

        # Run init bash script if provided (after GitHub setup, before marking running)
        if init_bash_script:
            try:
                await self._send_exec_and_wait(box_id, init_bash_script, 120.0)
            except Exception as exc:
                logger.exception("Init script failed for box %s", box_id)
                await self._broadcast_error(box_id, f"Init script failed: {exc}")
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
                "grpc_connected": True,
            }
        )

        logger.info("Box %s started successfully", box_id)

    async def _get_github_token(self, github_installation_id: str | None, project_id: str) -> str:
        if self._github_client_manager is None:
            raise RuntimeError("GitHub client manager not available")
        if not github_installation_id:
            raise RuntimeError("No GitHub installation ID for box")
        if not project_id:
            raise RuntimeError("No project_id for GitHub token retrieval")

        client = await self._github_client_manager.get_client(project_id)
        if client is None:
            raise RuntimeError("GitHub not configured for project")

        installation_service = self._github_client_manager.get_installation_service(project_id)
        if installation_service is None:
            raise RuntimeError("GitHub installation service not available")

        installation = await installation_service.get_installation(github_installation_id)
        if installation is None:
            raise RuntimeError(f"GitHub installation not found: {github_installation_id}")

        return await installation_service.get_token(installation.installation_id)

    async def _get_github_default_branch(self, project_id: str) -> str:
        """Return the project's configured default base branch, falling back to 'main'."""
        if not project_id or self._github_client_manager is None:
            return "main"
        settings = self._github_client_manager.get_project_settings(project_id)
        if settings and settings.github_default_base_branch:
            return settings.github_default_base_branch
        return "main"

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
