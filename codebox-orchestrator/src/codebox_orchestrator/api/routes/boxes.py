"""JSON REST API routes for box management."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.api.dependencies import (
    get_cancel_box,
    get_create_box,
    get_delete_box,
    get_github_client_manager,
    get_llm_profile_service,
    get_query_service,
    get_restart_box,
    get_runtime,
    get_send_exec,
    get_send_message,
    get_stop_box,
    get_user_settings_service,
)
from codebox_orchestrator.api.schemas import (
    BoxCreate,
    BoxEventResponse,
    BoxExec,
    BoxMessage,
    BoxResponse,
)
from codebox_orchestrator.auth.dependencies import UserInfo, get_current_user

if TYPE_CHECKING:
    from codebox_orchestrator.agent.application.commands.send_exec import SendExecHandler
    from codebox_orchestrator.agent.application.commands.send_message import SendMessageHandler
    from codebox_orchestrator.box.application.commands.cancel_box import CancelBoxHandler
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.box.application.commands.delete_box import DeleteBoxHandler
    from codebox_orchestrator.box.application.commands.restart_box import RestartBoxHandler
    from codebox_orchestrator.box.application.commands.stop_box import StopBoxHandler
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.compute.docker.docker_adapter import DockerRuntime
    from codebox_orchestrator.integration.github.application.client_manager import (
        GitHubClientManager,
    )
    from codebox_orchestrator.integration.github.application.installation_service import (
        GitHubInstallationService,
    )
    from codebox_orchestrator.integration.github.domain.entities import GitHubInstallation
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.user_settings.service import UserSettingsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


async def _find_installation_for_repo(
    service: GitHubInstallationService, repo_full_name: str
) -> GitHubInstallation | None:
    """Find the GitHub installation that owns a given repo."""
    installations = await service.list_installations()
    for inst in installations:
        try:
            repos = await service.sync_repos(inst.installation_id)
            if any(r.get("full_name") == repo_full_name for r in repos):
                return inst
        except Exception:
            logger.warning("Failed to check repos for installation %d", inst.installation_id)
    return None


# ── Health ───────────────────────────────────────────────────────


@router.get("/health")
async def health_check():
    return {"status": "ok"}


# ── Boxes ────────────────────────────────────────────────────────


@router.post("/boxes", status_code=201)
async def create_box(
    body: BoxCreate,
    user: UserInfo = Depends(get_current_user),
    handler: CreateBoxHandler = Depends(get_create_box),
    profile_service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: UserSettingsService = Depends(get_user_settings_service),
    github_client_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> BoxResponse:
    """Create and auto-start a new box."""

    # ── Resolve LLM profile ────────────────────────────────
    profile_id = body.llm_profile_id
    if not profile_id:
        profile_id = await settings_service.get_default_profile_id(user.user_id)
    if not profile_id:
        raise HTTPException(400, "No LLM profile selected and no default profile configured")

    resolved = await profile_service.resolve_profile(profile_id, user.user_id)
    if resolved is None:
        raise HTTPException(400, "LLM profile not found or does not belong to you")

    tavily_api_key = await settings_service.get_tavily_api_key(user.user_id)

    # ── Resolve GitHub (if requested) ──────────────────────
    github_installation_id: str | None = None
    github_branch: str | None = None

    if body.github_repo:
        client = await github_client_mgr.get_client(user.user_id)
        if client is None:
            raise HTTPException(400, "GitHub integration is not configured in your settings")
        installation_service = github_client_mgr.get_installation_service(user.user_id)
        if installation_service is None:
            raise HTTPException(400, "GitHub integration is not configured in your settings")
        installation = await _find_installation_for_repo(installation_service, body.github_repo)
        if installation is None:
            raise HTTPException(400, f"No GitHub installation found for repo: {body.github_repo}")
        github_installation_id = installation.id
        github_branch = f"codebox/manual-{body.github_repo.split('/')[-1]}"

    view = await handler.execute(
        name=body.name,
        description=body.description,
        tags=body.tags,
        provider=resolved.provider,
        model=resolved.model,
        api_key=resolved.api_key,
        base_url=resolved.base_url,
        tavily_api_key=tavily_api_key,
        system_prompt=body.system_prompt,
        auto_start_prompt=body.auto_start_prompt,
        recursion_limit=body.recursion_limit,
        tool_settings=body.tools.model_dump(exclude_none=True) if body.tools else None,
        github_repo=body.github_repo,
        github_branch=github_branch,
        github_installation_id=github_installation_id,
        init_bash_script=body.init_bash_script,
        user_id=user.user_id,
    )
    return BoxResponse.from_view(view)


@router.get("/boxes")
async def list_boxes(
    container_status: str | None = None,
    activity: str | None = None,
    trigger: str | None = None,
    query: BoxQueryService = Depends(get_query_service),
) -> list[BoxResponse]:
    """List boxes, optionally filtered."""
    boxes = query.list_boxes(
        container_status=container_status,
        activity=activity,
        trigger=trigger,
    )
    return [BoxResponse.from_view(b) for b in boxes]


@router.get("/boxes/{box_id}")
async def get_box(
    box_id: str,
    query: BoxQueryService = Depends(get_query_service),
) -> BoxResponse:
    box = query.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_view(box)


@router.get("/boxes/{box_id}/events")
async def get_box_events_route(
    box_id: str,
    after_seq: int | None = None,
    query: BoxQueryService = Depends(get_query_service),
) -> list[BoxEventResponse]:
    """Return canonical persisted events for a box."""
    box = query.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    try:
        events = await query.list_events(box_id, after_seq=after_seq)
    except NoActiveConnectionError as exc:
        raise HTTPException(503, "Container is not connected") from exc
    except Exception as exc:
        raise HTTPException(502, f"Failed to get events: {exc}") from exc
    return [BoxEventResponse(**e) for e in events]


@router.post("/boxes/{box_id}/stop")
async def stop_box(
    box_id: str,
    handler: StopBoxHandler = Depends(get_stop_box),
    query: BoxQueryService = Depends(get_query_service),
) -> BoxResponse:
    await handler.execute(box_id)
    box = query.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_view(box)


@router.post("/boxes/{box_id}/restart")
async def restart_box(
    box_id: str,
    handler: RestartBoxHandler = Depends(get_restart_box),
) -> BoxResponse:
    """Restart a stopped box."""
    from codebox_orchestrator.box.domain.exceptions import (  # noqa: PLC0415
        BoxNotFoundError,
        InvalidStatusTransitionError,
    )

    try:
        view = await handler.execute(box_id)
    except BoxNotFoundError as exc:
        raise HTTPException(404, "Box not found") from exc
    except InvalidStatusTransitionError as exc:
        raise HTTPException(400, str(exc)) from exc
    return BoxResponse.from_view(view)


@router.post("/boxes/{box_id}/cancel")
async def cancel_box(
    box_id: str,
    handler: CancelBoxHandler = Depends(get_cancel_box),
):
    await handler.execute(box_id)
    return {"status": "cancelled"}


@router.post("/boxes/{box_id}/message")
async def send_message(
    box_id: str,
    body: BoxMessage,
    handler: SendMessageHandler = Depends(get_send_message),
):
    try:
        await handler.execute(box_id, body.message)
    except NoActiveConnectionError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"status": "sent"}


@router.post("/boxes/{box_id}/exec")
async def exec_box(
    box_id: str,
    body: BoxExec,
    handler: SendExecHandler = Depends(get_send_exec),
):
    try:
        await handler.execute(box_id, body.command)
    except NoActiveConnectionError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"status": "sent"}


@router.delete("/boxes/{box_id}", status_code=204)
async def delete_box(
    box_id: str,
    handler: DeleteBoxHandler = Depends(get_delete_box),
):
    await handler.execute(box_id)


@router.get("/boxes/{box_id}/logs")
async def box_logs(
    box_id: str,
    tail: int = 200,
    query: BoxQueryService = Depends(get_query_service),
    runtime: DockerRuntime = Depends(get_runtime),
):
    """Get container logs for a box."""
    box = query.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    try:
        logs = runtime.get_logs(box.container_name, tail=tail)
    except Exception as exc:
        raise HTTPException(502, f"Failed to get logs: {exc}") from exc
    return {"logs": logs}
