"""JSON REST API routes for container management (DDD version)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from codebox_orchestrator.api.dependencies import get_runtime
from codebox_orchestrator.api.schemas import ContainerLogsResponse, ContainerResponse
from codebox_orchestrator.compute.docker.docker_adapter import DockerRuntime, DockerServiceError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.get("/containers")
async def list_containers(
    runtime: DockerRuntime = Depends(get_runtime),
) -> list[ContainerResponse]:
    containers = runtime.list_containers()
    return [
        ContainerResponse(
            id=c.id,
            name=c.name,
            status=c.status,
            image=c.image,
            model=c.model or None,
            started_at=c.started_at,
            created_at=c.created_at,
        )
        for c in containers
    ]


@router.get("/containers/{container_id}/logs")
async def get_container_logs(
    container_id: str,
    tail: int = 200,
    runtime: DockerRuntime = Depends(get_runtime),
) -> ContainerLogsResponse:
    try:
        logs = runtime.get_logs(container_id, tail=tail)
    except DockerServiceError as exc:
        raise HTTPException(400, str(exc)) from exc
    return ContainerLogsResponse(logs=logs)


@router.post("/containers/{container_id}/stop")
async def stop_container(
    container_id: str,
    runtime: DockerRuntime = Depends(get_runtime),
):
    try:
        runtime.stop(container_id)
    except DockerServiceError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"status": "stopped"}


@router.post("/containers/{container_id}/start")
async def start_container(
    container_id: str,
    runtime: DockerRuntime = Depends(get_runtime),
):
    try:
        runtime.start(container_id)
    except DockerServiceError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"status": "started"}


@router.delete("/containers/{container_id}", status_code=204)
async def delete_container(
    container_id: str,
    runtime: DockerRuntime = Depends(get_runtime),
):
    try:
        runtime.remove(container_id)
    except DockerServiceError as exc:
        raise HTTPException(400, str(exc)) from exc
