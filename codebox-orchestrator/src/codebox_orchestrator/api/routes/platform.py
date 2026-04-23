"""Platform-level (admin-only) REST API routes."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException

from codebox_orchestrator.api.dependencies import get_orphan_scan_service
from codebox_orchestrator.api.schemas import OrphanContainerResponse
from codebox_orchestrator.auth.dependencies import UserInfo, require_admin
from codebox_orchestrator.compute.docker.docker_service import DockerServiceError

if TYPE_CHECKING:
    from codebox_orchestrator.platform.application.orphan_scan import OrphanScanService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/platform", tags=["Platform"])


@router.get(
    "/orphan-containers",
    summary="List orphaned sandbox containers",
    operation_id="list_orphan_containers",
)
async def list_orphan_containers(
    _: UserInfo = Depends(require_admin),
    service: OrphanScanService = Depends(get_orphan_scan_service),
) -> list[OrphanContainerResponse]:
    try:
        orphans = await service.list_orphans()
    except DockerServiceError as exc:
        raise HTTPException(502, f"Failed to list containers: {exc}") from exc
    return [OrphanContainerResponse.from_view(o) for o in orphans]


@router.delete(
    "/orphan-containers/{container_id}",
    status_code=204,
    summary="Delete an orphaned sandbox container",
    operation_id="delete_orphan_container",
)
async def delete_orphan_container(
    container_id: str,
    _: UserInfo = Depends(require_admin),
    service: OrphanScanService = Depends(get_orphan_scan_service),
) -> None:
    try:
        await service.delete_orphan(container_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except DockerServiceError as exc:
        raise HTTPException(502, f"Failed to remove container: {exc}") from exc
