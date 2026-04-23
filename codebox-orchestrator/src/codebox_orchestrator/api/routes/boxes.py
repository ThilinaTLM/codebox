"""JSON REST API routes for box management (project-scoped)."""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.api.dependencies import (
    get_box_repository,
    get_cancel_box,
    get_create_box,
    get_delete_box,
    get_github_client_manager,
    get_llm_profile_service,
    get_project_settings_service,
    get_query_service,
    get_restart_box,
    get_runtime,
    get_send_message,
    get_stop_box,
)
from codebox_orchestrator.api.schemas import (
    BoxCreate,
    BoxEventResponse,
    BoxMessage,
    BoxResponse,
    BoxUpdateRequest,
)
from codebox_orchestrator.project.dependencies import ProjectContext, get_project_context

if TYPE_CHECKING:
    from codebox_orchestrator.agent.application.commands.send_message import SendMessageHandler
    from codebox_orchestrator.box.application.commands.cancel_box import CancelBoxHandler
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.box.application.commands.delete_box import DeleteBoxHandler
    from codebox_orchestrator.box.application.commands.restart_box import RestartBoxHandler
    from codebox_orchestrator.box.application.commands.stop_box import StopBoxHandler
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.box.infrastructure.box_repository import BoxRepository
    from codebox_orchestrator.compute.docker.docker_adapter import DockerRuntime
    from codebox_orchestrator.integration.github.application.client_manager import (
        GitHubClientManager,
    )
    from codebox_orchestrator.integration.github.application.installation_service import (
        GitHubInstallationService,
    )
    from codebox_orchestrator.integration.github.domain.entities import GitHubInstallation
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.project_settings.service import ProjectSettingsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects/{slug}", tags=["Boxes"])


async def _find_installation_for_repo(
    service: GitHubInstallationService, repo_full_name: str
) -> GitHubInstallation | None:
    from codebox_orchestrator.integration.github.application.installation_resolver import (  # noqa: PLC0415
        resolve_installation_for_repo,
    )

    return await resolve_installation_for_repo(service, repo_full_name, strict=False)


@router.get("/health", summary="Project-scoped health check", operation_id="project_health")
async def health_check():
    return {"status": "ok"}


@router.post("/boxes", status_code=201, summary="Create a box", operation_id="create_box")
async def create_box(
    body: BoxCreate,
    ctx: ProjectContext = Depends(get_project_context),
    handler: CreateBoxHandler = Depends(get_create_box),
    profile_service: LLMProfileService = Depends(get_llm_profile_service),
    settings_service: ProjectSettingsService = Depends(get_project_settings_service),
    github_client_mgr: GitHubClientManager = Depends(get_github_client_manager),
) -> BoxResponse:
    profile_id = body.llm_profile_id or await settings_service.get_default_profile_id(
        ctx.project_id
    )
    if not profile_id:
        raise HTTPException(400, "No LLM profile selected and no default profile configured")

    resolved = await profile_service.resolve_profile(profile_id, ctx.project_id)
    if resolved is None:
        raise HTTPException(400, "LLM profile not found or does not belong to this project")

    tavily_api_key = await settings_service.get_tavily_api_key(ctx.project_id)

    github_installation_id: str | None = None
    github_branch: str | None = None
    effective_workspace_mode: str | None = None
    effective_workspace_ref: str | None = None
    if body.github_repo:
        client = await github_client_mgr.get_client(ctx.project_id)
        if client is None:
            raise HTTPException(400, "GitHub integration is not configured in project settings")
        installation_service = github_client_mgr.get_installation_service(ctx.project_id)
        if installation_service is None:
            raise HTTPException(400, "GitHub integration is not configured in project settings")
        installation = await _find_installation_for_repo(installation_service, body.github_repo)
        if installation is None:
            raise HTTPException(400, f"No GitHub installation found for repo: {body.github_repo}")
        github_installation_id = installation.id

        # Resolve effective workspace mode + unique working branch.
        if body.github_workspace_mode is not None:
            effective_workspace_mode = body.github_workspace_mode
        elif body.github_base_branch:
            effective_workspace_mode = "pinned"
        else:
            effective_workspace_mode = "branch_from_issue"
        effective_workspace_ref = body.github_base_branch

        # Compute a unique working branch so that two concurrent manual
        # boxes on the same repo don't collide on push.
        short_suffix = uuid.uuid4().hex[:8]
        repo_short = body.github_repo.split("/", 1)[-1]
        if effective_workspace_mode == "pinned" and body.github_base_branch:
            # setup_commands will checkout ``base_branch`` and — when it's
            # not already a codebox/* branch — fork off a codebox/pinned-<ts>
            # work branch. Pass the base branch here so git can resolve it.
            github_branch = body.github_base_branch
        else:
            github_branch = f"codebox/manual-{repo_short}-{short_suffix}"

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
        github_workspace_mode=effective_workspace_mode,
        github_workspace_ref=effective_workspace_ref,
        init_bash_script=body.init_bash_script,
        project_id=ctx.project_id,
        created_by=ctx.user_id,
    )
    return BoxResponse.from_view(view)


@router.get("/boxes", summary="List boxes", operation_id="list_boxes")
async def list_boxes(
    container_status: str | None = None,
    activity: str | None = None,
    trigger: str | None = None,
    ctx: ProjectContext = Depends(get_project_context),
    query: BoxQueryService = Depends(get_query_service),
) -> list[BoxResponse]:
    boxes = await query.list_boxes(
        project_id=ctx.project_id,
        container_status=container_status,
        activity=activity,
        trigger=trigger,
    )
    return [BoxResponse.from_view(b) for b in boxes]


@router.get("/boxes/{box_id}", summary="Get a box", operation_id="get_box")
async def get_box(
    box_id: str,
    ctx: ProjectContext = Depends(get_project_context),
    query: BoxQueryService = Depends(get_query_service),
) -> BoxResponse:
    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_view(box)


@router.patch("/boxes/{box_id}", summary="Update box metadata", operation_id="patch_box")
async def patch_box(
    box_id: str,
    body: BoxUpdateRequest,
    ctx: ProjectContext = Depends(get_project_context),
    repository: BoxRepository = Depends(get_box_repository),
    query: BoxQueryService = Depends(get_query_service),
) -> BoxResponse:
    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
        raise HTTPException(404, "Box not found")
    updated = await repository.update_metadata(
        box_id,
        name=body.name,
        description=body.description,
        tags=body.tags,
    )
    if updated is None:
        raise HTTPException(404, "Box not found")
    refreshed = await query.get_box(box_id)
    if refreshed is None:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_view(refreshed)


@router.get("/boxes/{box_id}/events", summary="List box events", operation_id="list_box_events")
async def get_box_events_route(
    box_id: str,
    after_seq: int | None = None,
    limit: int | None = None,
    ctx: ProjectContext = Depends(get_project_context),
    query: BoxQueryService = Depends(get_query_service),
) -> list[BoxEventResponse]:
    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
        raise HTTPException(404, "Box not found")
    try:
        events = await query.list_events(box_id, after_seq=after_seq, limit=limit)
    except Exception as exc:
        raise HTTPException(502, f"Failed to get events: {exc}") from exc
    return [BoxEventResponse(**e) for e in events]


@router.post("/boxes/{box_id}/stop", summary="Stop a box", operation_id="stop_box")
async def stop_box(
    box_id: str,
    ctx: ProjectContext = Depends(get_project_context),
    handler: StopBoxHandler = Depends(get_stop_box),
    query: BoxQueryService = Depends(get_query_service),
) -> BoxResponse:
    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
        raise HTTPException(404, "Box not found")
    await handler.execute(box_id)
    box = await query.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_view(box)


@router.post("/boxes/{box_id}/restart", summary="Restart a box", operation_id="restart_box")
async def restart_box(
    box_id: str,
    ctx: ProjectContext = Depends(get_project_context),
    handler: RestartBoxHandler = Depends(get_restart_box),
    query: BoxQueryService = Depends(get_query_service),
) -> BoxResponse:
    from codebox_orchestrator.box.domain.exceptions import (  # noqa: PLC0415
        BoxNotFoundError,
        InvalidStatusTransitionError,
    )

    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
        raise HTTPException(404, "Box not found")

    try:
        view = await handler.execute(box_id)
    except BoxNotFoundError as exc:
        raise HTTPException(404, "Box not found") from exc
    except InvalidStatusTransitionError as exc:
        raise HTTPException(400, str(exc)) from exc
    return BoxResponse.from_view(view)


@router.post("/boxes/{box_id}/cancel", summary="Cancel a box run", operation_id="cancel_box")
async def cancel_box(
    box_id: str,
    ctx: ProjectContext = Depends(get_project_context),
    handler: CancelBoxHandler = Depends(get_cancel_box),
    query: BoxQueryService = Depends(get_query_service),
):
    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
        raise HTTPException(404, "Box not found")
    await handler.execute(box_id)
    return {"status": "cancelled"}


@router.post(
    "/boxes/{box_id}/message",
    summary="Send a message to a box",
    operation_id="message_box",
)
async def send_message(
    box_id: str,
    body: BoxMessage,
    ctx: ProjectContext = Depends(get_project_context),
    handler: SendMessageHandler = Depends(get_send_message),
    query: BoxQueryService = Depends(get_query_service),
):
    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
        raise HTTPException(404, "Box not found")
    try:
        await handler.execute(box_id, body.message)
    except NoActiveConnectionError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"status": "sent"}


@router.delete(
    "/boxes/{box_id}",
    status_code=204,
    summary="Delete a box",
    operation_id="delete_box",
)
async def delete_box(
    box_id: str,
    ctx: ProjectContext = Depends(get_project_context),
    handler: DeleteBoxHandler = Depends(get_delete_box),
    query: BoxQueryService = Depends(get_query_service),
):
    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
        raise HTTPException(404, "Box not found")
    await handler.execute(box_id)


@router.get("/boxes/{box_id}/logs", summary="Get box logs", operation_id="get_box_logs")
async def box_logs(
    box_id: str,
    tail: int = 200,
    ctx: ProjectContext = Depends(get_project_context),
    query: BoxQueryService = Depends(get_query_service),
    runtime: DockerRuntime = Depends(get_runtime),
):
    box = await query.get_box(box_id)
    if box is None or box.project_id != ctx.project_id:
        raise HTTPException(404, "Box not found")
    try:
        logs = runtime.get_logs(box.container_name, tail=tail)
    except Exception as exc:
        raise HTTPException(502, f"Failed to get logs: {exc}") from exc
    return {"logs": logs}
