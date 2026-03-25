"""JSON REST API routes for box and container management."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from codebox_orchestrator.db.models import BoxStatus
from codebox_orchestrator.schemas import (
    BoxCreate,
    BoxEventResponse,
    BoxMessage,
    BoxResponse,
    ContainerResponse,
)
from codebox_orchestrator.services import docker_service
from codebox_orchestrator.services.box_service import BoxService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


def _bs(request: Request) -> BoxService:
    return request.app.state.box_service


# ── Health ───────────────────────────────────────────────────────


@router.get("/health")
async def health_check():
    return {"status": "ok"}


# ── Boxes ────────────────────────────────────────────────────────


@router.post("/boxes", status_code=201)
async def create_box(request: Request, body: BoxCreate) -> BoxResponse:
    """Create and auto-start a new box."""
    bs = _bs(request)
    box = await bs.create_box(
        name=body.name,
        model=body.model,
        system_prompt=body.system_prompt,
        initial_prompt=body.initial_prompt,
        auto_stop=body.auto_stop,
    )
    return BoxResponse.from_orm_box(box)


@router.get("/boxes")
async def list_boxes(
    request: Request,
    status: str | None = None,
    trigger: str | None = None,
) -> list[BoxResponse]:
    """List boxes, optionally filtered by status or trigger."""
    bs = _bs(request)
    box_status = None
    if status:
        try:
            box_status = BoxStatus(status)
        except ValueError:
            raise HTTPException(400, f"Invalid status: {status}")
    boxes = await bs.list_boxes(status=box_status, trigger=trigger)
    return [BoxResponse.from_orm_box(b) for b in boxes]


@router.get("/boxes/{box_id}")
async def get_box(request: Request, box_id: str) -> BoxResponse:
    bs = _bs(request)
    box = await bs.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_orm_box(box)


@router.get("/boxes/{box_id}/events")
async def get_box_events(request: Request, box_id: str) -> list[BoxEventResponse]:
    """Return persisted events for a box."""
    bs = _bs(request)
    box = await bs.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    events = await bs.get_box_events(box_id)
    return [BoxEventResponse.from_orm_event(e) for e in events]


@router.post("/boxes/{box_id}/stop")
async def stop_box(request: Request, box_id: str) -> BoxResponse:
    bs = _bs(request)
    await bs.stop_box(box_id)
    box = await bs.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_orm_box(box)


@router.post("/boxes/{box_id}/cancel")
async def cancel_box(request: Request, box_id: str):
    bs = _bs(request)
    await bs.cancel_box(box_id)
    return {"status": "cancelled"}


@router.post("/boxes/{box_id}/message")
async def send_message(request: Request, box_id: str, body: BoxMessage):
    bs = _bs(request)
    try:
        await bs.send_message(box_id, body.message)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"status": "sent"}


@router.delete("/boxes/{box_id}", status_code=204)
async def delete_box(request: Request, box_id: str):
    bs = _bs(request)
    await bs.delete_box(box_id)


@router.get("/boxes/{box_id}/files")
async def box_list_files(
    request: Request, box_id: str, path: str = ""
):
    """List directory contents in a box workspace."""
    bs = _bs(request)
    box = await bs.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    try:
        return await bs.list_files(box_id, path)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(502, f"Box file proxy error: {exc}")


@router.get("/boxes/{box_id}/files/read")
async def box_read_file(request: Request, box_id: str, path: str):
    """Read a file from a box workspace."""
    bs = _bs(request)
    box = await bs.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    try:
        return await bs.read_file(box_id, path)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except RuntimeError as exc:
        raise HTTPException(502, f"Box file proxy error: {exc}")


# ── Containers ───────────────────────────────────────────────────


@router.get("/containers")
async def list_containers() -> list[ContainerResponse]:
    containers = docker_service.list_containers()
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


@router.post("/containers/{container_id}/stop")
async def stop_container(container_id: str):
    try:
        docker_service.stop(container_id)
    except docker_service.DockerServiceError as exc:
        raise HTTPException(400, str(exc))
    return {"status": "stopped"}


@router.post("/containers/{container_id}/start")
async def start_container(container_id: str):
    try:
        docker_service.start(container_id)
    except docker_service.DockerServiceError as exc:
        raise HTTPException(400, str(exc))
    return {"status": "started"}


@router.delete("/containers/{container_id}", status_code=204)
async def delete_container(container_id: str):
    try:
        docker_service.remove(container_id)
    except docker_service.DockerServiceError as exc:
        raise HTTPException(400, str(exc))
