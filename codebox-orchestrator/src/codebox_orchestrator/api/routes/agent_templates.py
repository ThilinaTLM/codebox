"""REST API routes for agent templates (project-scoped)."""

from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from codebox_orchestrator.agent_template.schemas import (
    AgentTemplateCreate,
    AgentTemplateDryRunRequest,
    AgentTemplateDryRunResponse,
    AgentTemplateListResponse,
    AgentTemplateResponse,
    AgentTemplateRunListResponse,
    AgentTemplateRunResponse,
    AgentTemplateUpdate,
)
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
    require_project_admin,
)

if TYPE_CHECKING:
    from codebox_orchestrator.agent_template.service import AgentTemplateService

router = APIRouter(
    prefix="/api/projects/{slug}/agent-templates",
    tags=["Agent Templates"],
)


def get_agent_template_service(request: Request):
    return request.app.state.agent_template_service


def _encode_cursor(created_at: datetime, run_id: str) -> str:
    raw = f"{created_at.astimezone(UTC).isoformat()}|{run_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str | None) -> tuple[datetime, str] | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        created_at_s, run_id = raw.split("|", 1)
        return datetime.fromisoformat(created_at_s), run_id
    except Exception:
        return None


# ── CRUD ─────────────────────────────────────────────────────


@router.get(
    "",
    summary="List agent templates",
    operation_id="list_agent_templates",
)
async def list_templates(
    trigger_kind: str | None = None,
    enabled: bool | None = None,
    ctx: ProjectContext = Depends(get_project_context),
    service: AgentTemplateService = Depends(get_agent_template_service),
) -> AgentTemplateListResponse:
    templates = await service.list(ctx.project_id, trigger_kind=trigger_kind, enabled=enabled)
    return AgentTemplateListResponse(templates=templates)


@router.post(
    "",
    status_code=201,
    summary="Create agent template",
    operation_id="create_agent_template",
)
async def create_template(
    body: AgentTemplateCreate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: AgentTemplateService = Depends(get_agent_template_service),
) -> AgentTemplateResponse:
    try:
        return await service.create(ctx.project_id, ctx.user_id, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get(
    "/{template_id}",
    summary="Get agent template",
    operation_id="get_agent_template",
)
async def get_template(
    template_id: str,
    ctx: ProjectContext = Depends(get_project_context),
    service: AgentTemplateService = Depends(get_agent_template_service),
) -> AgentTemplateResponse:
    template = await service.get(ctx.project_id, template_id)
    if template is None:
        raise HTTPException(404, "Template not found")
    return template


@router.patch(
    "/{template_id}",
    summary="Update agent template",
    operation_id="patch_agent_template",
)
async def update_template(
    template_id: str,
    body: AgentTemplateUpdate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: AgentTemplateService = Depends(get_agent_template_service),
) -> AgentTemplateResponse:
    try:
        template = await service.update(ctx.project_id, template_id, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if template is None:
        raise HTTPException(404, "Template not found")
    return template


@router.delete(
    "/{template_id}",
    status_code=204,
    summary="Delete agent template",
    operation_id="delete_agent_template",
)
async def delete_template(
    template_id: str,
    ctx: ProjectContext = Depends(require_project_admin),
    service: AgentTemplateService = Depends(get_agent_template_service),
) -> Response:
    deleted = await service.delete(ctx.project_id, template_id)
    if not deleted:
        raise HTTPException(404, "Template not found")
    return Response(status_code=204)


# ── Runs ─────────────────────────────────────────────────────


@router.get(
    "/{template_id}/runs",
    summary="List runs for an agent template",
    operation_id="list_agent_template_runs",
)
async def list_runs(
    template_id: str,
    cursor: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = 50,
    ctx: ProjectContext = Depends(get_project_context),
    service: AgentTemplateService = Depends(get_agent_template_service),
) -> AgentTemplateRunListResponse:
    # Verify the template exists within this project before returning runs
    template = await service.get(ctx.project_id, template_id)
    if template is None:
        raise HTTPException(404, "Template not found")

    limit = max(1, min(limit, 200))
    cursor_tuple = _decode_cursor(cursor)
    runs: list[AgentTemplateRunResponse] = await service.list_runs(
        ctx.project_id,
        template_id=template_id,
        status=status_filter,
        cursor=cursor_tuple,
        limit=limit,
    )
    next_cursor = None
    if len(runs) == limit:
        tail = runs[-1]
        next_cursor = _encode_cursor(tail.created_at, tail.id)
    return AgentTemplateRunListResponse(runs=runs, next_cursor=next_cursor)


# ── Dry-run ──────────────────────────────────────────────────


@router.post(
    "/{template_id}/dry-run",
    summary="Dry-run a template against a synthetic event",
    operation_id="dry_run_agent_template",
)
async def dry_run_template(
    template_id: str,
    body: AgentTemplateDryRunRequest,
    request: Request,
    ctx: ProjectContext = Depends(require_project_admin),
    service: AgentTemplateService = Depends(get_agent_template_service),
) -> AgentTemplateDryRunResponse:
    from codebox_orchestrator.agent_template.application.dry_run import (  # noqa: PLC0415
        execute_dry_run,
    )

    template = await service.get(ctx.project_id, template_id)
    if template is None:
        raise HTTPException(404, "Template not found")

    try:
        return await execute_dry_run(
            template=template,
            body=body,
            matcher=request.app.state.template_matcher,
            renderer=request.app.state.prompt_renderer,
            registry=request.app.state.context_builder_registry,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
