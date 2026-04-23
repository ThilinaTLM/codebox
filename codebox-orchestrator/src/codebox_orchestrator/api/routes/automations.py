"""REST API routes for automations (project-scoped)."""

from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from codebox_orchestrator.automation.schemas import (
    AutomationCreate,
    AutomationDryRunRequest,
    AutomationDryRunResponse,
    AutomationListResponse,
    AutomationResponse,
    AutomationRunListResponse,
    AutomationRunResponse,
    AutomationUpdate,
)
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
    require_project_admin,
)

if TYPE_CHECKING:
    from codebox_orchestrator.automation.service import AutomationService

router = APIRouter(
    prefix="/api/projects/{slug}/automations",
    tags=["Automations"],
)


def get_automation_service(request: Request):
    return request.app.state.automation_service


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
    summary="List automations",
    operation_id="list_automations",
)
async def list_automations(
    trigger_kind: str | None = None,
    enabled: bool | None = None,
    ctx: ProjectContext = Depends(get_project_context),
    service: AutomationService = Depends(get_automation_service),
) -> AutomationListResponse:
    automations = await service.list(ctx.project_id, trigger_kind=trigger_kind, enabled=enabled)
    return AutomationListResponse(automations=automations)


@router.post(
    "",
    status_code=201,
    summary="Create automation",
    operation_id="create_automation",
)
async def create_automation(
    body: AutomationCreate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: AutomationService = Depends(get_automation_service),
) -> AutomationResponse:
    try:
        return await service.create(ctx.project_id, ctx.user_id, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get(
    "/{automation_id}",
    summary="Get automation",
    operation_id="get_automation",
)
async def get_automation(
    automation_id: str,
    ctx: ProjectContext = Depends(get_project_context),
    service: AutomationService = Depends(get_automation_service),
) -> AutomationResponse:
    automation = await service.get(ctx.project_id, automation_id)
    if automation is None:
        raise HTTPException(404, "Automation not found")
    return automation


@router.patch(
    "/{automation_id}",
    summary="Update automation",
    operation_id="patch_automation",
)
async def update_automation(
    automation_id: str,
    body: AutomationUpdate,
    ctx: ProjectContext = Depends(require_project_admin),
    service: AutomationService = Depends(get_automation_service),
) -> AutomationResponse:
    try:
        automation = await service.update(ctx.project_id, automation_id, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if automation is None:
        raise HTTPException(404, "Automation not found")
    return automation


@router.delete(
    "/{automation_id}",
    status_code=204,
    summary="Delete automation",
    operation_id="delete_automation",
)
async def delete_automation(
    automation_id: str,
    ctx: ProjectContext = Depends(require_project_admin),
    service: AutomationService = Depends(get_automation_service),
) -> Response:
    deleted = await service.delete(ctx.project_id, automation_id)
    if not deleted:
        raise HTTPException(404, "Automation not found")
    return Response(status_code=204)


# ── Runs ─────────────────────────────────────────────────────


@router.get(
    "/{automation_id}/runs",
    summary="List runs for an automation",
    operation_id="list_automation_runs",
)
async def list_runs(
    automation_id: str,
    cursor: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = 50,
    ctx: ProjectContext = Depends(get_project_context),
    service: AutomationService = Depends(get_automation_service),
) -> AutomationRunListResponse:
    # Verify the automation exists within this project before returning runs
    automation = await service.get(ctx.project_id, automation_id)
    if automation is None:
        raise HTTPException(404, "Automation not found")

    limit = max(1, min(limit, 200))
    cursor_tuple = _decode_cursor(cursor)
    runs: list[AutomationRunResponse] = await service.list_runs(
        ctx.project_id,
        automation_id=automation_id,
        status=status_filter,
        cursor=cursor_tuple,
        limit=limit,
    )
    next_cursor = None
    if len(runs) == limit:
        tail = runs[-1]
        next_cursor = _encode_cursor(tail.created_at, tail.id)
    return AutomationRunListResponse(runs=runs, next_cursor=next_cursor)


# ── Dry-run ──────────────────────────────────────────────────


@router.post(
    "/{automation_id}/dry-run",
    summary="Dry-run an automation against a synthetic event",
    operation_id="dry_run_automation",
)
async def dry_run_automation(
    automation_id: str,
    body: AutomationDryRunRequest,
    request: Request,
    ctx: ProjectContext = Depends(require_project_admin),
    service: AutomationService = Depends(get_automation_service),
) -> AutomationDryRunResponse:
    from codebox_orchestrator.automation.application.dry_run import (  # noqa: PLC0415
        execute_dry_run,
    )

    automation = await service.get(ctx.project_id, automation_id)
    if automation is None:
        raise HTTPException(404, "Automation not found")

    try:
        return await execute_dry_run(
            automation=automation,
            body=body,
            matcher=request.app.state.automation_matcher,
            renderer=request.app.state.prompt_renderer,
            registry=request.app.state.context_builder_registry,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
