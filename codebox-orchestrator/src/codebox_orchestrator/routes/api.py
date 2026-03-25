"""JSON REST API routes for task and container management."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from codebox_orchestrator.db.models import TaskStatus
from codebox_orchestrator.schemas import (
    ContainerResponse,
    FeedbackMessage,
    TaskCreate,
    TaskEventResponse,
    TaskResponse,
)
from codebox_orchestrator.services import docker_service
from codebox_orchestrator.services.task_service import TaskService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


def _ts(request: Request) -> TaskService:
    return request.app.state.task_service


# ── Health ───────────────────────────────────────────────────────


@router.get("/health")
async def health_check():
    return {"status": "ok"}


# ── Tasks ────────────────────────────────────────────────────────


@router.post("/tasks", status_code=201)
async def create_task(request: Request, body: TaskCreate) -> TaskResponse:
    """Create a new task and auto-start it."""
    ts = _ts(request)
    task = await ts.create_task(
        title=body.title,
        prompt=body.prompt,
        model=body.model,
        system_prompt=body.system_prompt,
        workspace_path=body.workspace_path,
    )
    await ts.start_task(task.id)
    return TaskResponse.from_orm_task(task)


@router.get("/tasks")
async def list_tasks(request: Request, status: str | None = None) -> list[TaskResponse]:
    """List tasks, optionally filtered by status."""
    ts = _ts(request)
    task_status = None
    if status:
        try:
            task_status = TaskStatus(status)
        except ValueError:
            raise HTTPException(400, f"Invalid status: {status}")
    tasks = await ts.list_tasks(status=task_status)
    return [TaskResponse.from_orm_task(t) for t in tasks]


@router.get("/tasks/{task_id}")
async def get_task(request: Request, task_id: str) -> TaskResponse:
    ts = _ts(request)
    task = await ts.get_task(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return TaskResponse.from_orm_task(task)


@router.get("/tasks/{task_id}/events")
async def get_task_events(request: Request, task_id: str) -> list[TaskEventResponse]:
    """Return persisted events for a task."""
    ts = _ts(request)
    task = await ts.get_task(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    events = await ts.get_task_events(task_id)
    return [TaskEventResponse.from_orm_event(e) for e in events]


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(request: Request, task_id: str) -> TaskResponse:
    ts = _ts(request)
    await ts.cancel_task(task_id)
    task = await ts.get_task(task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    return TaskResponse.from_orm_task(task)


@router.post("/tasks/{task_id}/feedback")
async def submit_feedback(request: Request, task_id: str, body: FeedbackMessage):
    ts = _ts(request)
    try:
        await ts.send_followup(task_id, body.message)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"status": "sent"}


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(request: Request, task_id: str):
    ts = _ts(request)
    await ts.delete_task(task_id)


# ── Containers ───────────────────────────────────────────────────


@router.get("/containers")
async def list_containers() -> list[ContainerResponse]:
    containers = docker_service.list_running()
    return [
        ContainerResponse(id=c.id, name=c.name, port=c.port)
        for c in containers
    ]


@router.post("/containers/{container_id}/stop")
async def stop_container(container_id: str):
    try:
        docker_service.stop(container_id)
    except docker_service.DockerServiceError as exc:
        raise HTTPException(400, str(exc))
    return {"status": "stopped"}
