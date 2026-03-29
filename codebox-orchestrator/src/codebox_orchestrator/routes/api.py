"""JSON REST API routes for box and container management."""

from __future__ import annotations

import base64
import logging
import mimetypes
from pathlib import PurePosixPath
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from codebox_orchestrator.db.models import Activity, ContainerStatus
from codebox_orchestrator.schemas import (
    BoxCreate,
    BoxEventResponse,
    BoxExec,
    BoxMessage,
    BoxMessageResponse,
    BoxResponse,
    ContainerLogsResponse,
    ContainerResponse,
)
from codebox_orchestrator.services import docker_service

if TYPE_CHECKING:
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
        dynamic_system_prompt=body.dynamic_system_prompt,
        initial_prompt=body.initial_prompt,
    )
    return BoxResponse.from_orm_box(box)


@router.get("/boxes")
async def list_boxes(
    request: Request,
    container_status: str | None = None,
    activity: str | None = None,
    trigger: str | None = None,
) -> list[BoxResponse]:
    """List boxes, optionally filtered by container_status, activity, or trigger."""
    bs = _bs(request)
    cs = None
    if container_status:
        try:
            cs = ContainerStatus(container_status)
        except ValueError as exc:
            raise HTTPException(400, f"Invalid container_status: {container_status}") from exc
    act = None
    if activity:
        try:
            act = Activity(activity)
        except ValueError as exc:
            raise HTTPException(400, f"Invalid activity: {activity}") from exc
    boxes = await bs.list_boxes(container_status=cs, activity=act, trigger=trigger)
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


@router.get("/boxes/{box_id}/messages")
async def get_box_messages(request: Request, box_id: str) -> list[BoxMessageResponse]:
    """Return structured chat thread for a box."""
    bs = _bs(request)
    box = await bs.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    messages = await bs.get_box_messages(box_id)
    return [BoxMessageResponse.from_orm_message(m) for m in messages]


@router.post("/boxes/{box_id}/stop")
async def stop_box(request: Request, box_id: str) -> BoxResponse:
    bs = _bs(request)
    await bs.stop_box(box_id)
    box = await bs.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_orm_box(box)


@router.post("/boxes/{box_id}/restart")
async def restart_box(request: Request, box_id: str) -> BoxResponse:
    """Restart a stopped box."""
    bs = _bs(request)
    try:
        box = await bs.restart_box(box_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
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
        raise HTTPException(400, str(exc)) from exc
    return {"status": "sent"}


@router.post("/boxes/{box_id}/exec")
async def exec_box(request: Request, box_id: str, body: BoxExec):
    bs = _bs(request)
    try:
        await bs.send_exec(box_id, body.command)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"status": "sent"}


@router.delete("/boxes/{box_id}", status_code=204)
async def delete_box(request: Request, box_id: str):
    bs = _bs(request)
    await bs.delete_box(box_id)


@router.get("/boxes/{box_id}/files")
async def box_list_files(request: Request, box_id: str, path: str = "/workspace"):
    """List directory contents in a box workspace."""
    bs = _bs(request)
    box = await bs.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    try:
        return await bs.list_files(box_id, path)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, f"Box file proxy error: {exc}") from exc


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
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, f"Box file proxy error: {exc}") from exc


@router.get("/boxes/{box_id}/files/download")
async def box_download_file(request: Request, box_id: str, path: str):
    """Download a file from a box workspace as raw bytes."""
    bs = _bs(request)
    box = await bs.get_box(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    try:
        data = await bs.read_file(box_id, path)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, f"Box file proxy error: {exc}") from exc

    if data.get("is_binary") and data.get("content_base64"):
        content_bytes = base64.b64decode(data["content_base64"])
    else:
        content_bytes = (data.get("content") or "").encode("utf-8")

    mime_type, _ = mimetypes.guess_type(path)
    filename = PurePosixPath(path).name
    return Response(
        content=content_bytes,
        media_type=mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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


@router.get("/containers/{container_id}/logs")
async def get_container_logs(container_id: str, tail: int = 200) -> ContainerLogsResponse:
    try:
        logs = docker_service.get_logs(container_id, tail=tail)
    except docker_service.DockerServiceError as exc:
        raise HTTPException(400, str(exc)) from exc
    return ContainerLogsResponse(logs=logs)


@router.post("/containers/{container_id}/stop")
async def stop_container(container_id: str):
    try:
        docker_service.stop(container_id)
    except docker_service.DockerServiceError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"status": "stopped"}


@router.post("/containers/{container_id}/start")
async def start_container(container_id: str):
    try:
        docker_service.start(container_id)
    except docker_service.DockerServiceError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"status": "started"}


@router.delete("/containers/{container_id}", status_code=204)
async def delete_container(container_id: str):
    try:
        docker_service.remove(container_id)
    except docker_service.DockerServiceError as exc:
        raise HTTPException(400, str(exc)) from exc
