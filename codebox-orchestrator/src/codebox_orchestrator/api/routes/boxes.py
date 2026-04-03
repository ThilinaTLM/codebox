"""JSON REST API routes for box management (DDD version)."""

from __future__ import annotations

import base64
import logging
import mimetypes
from pathlib import PurePosixPath
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.api.dependencies import (
    get_box_messages,
    get_cancel_box,
    get_create_box,
    get_delete_box,
    get_get_box,
    get_installation_service,
    get_lifecycle,
    get_list_boxes,
    get_list_files,
    get_read_file,
    get_restart_box,
    get_send_exec,
    get_send_message,
    get_stop_box,
)
from codebox_orchestrator.api.schemas import (
    BoxCreate,
    BoxExec,
    BoxMessage,
    BoxMessageResponse,
    BoxResponse,
)
from codebox_orchestrator.box.domain.enums import Activity, ContainerStatus
from codebox_orchestrator.box.domain.exceptions import (
    BoxNotFoundError,
    InvalidStatusTransitionError,
)

if TYPE_CHECKING:
    from codebox_orchestrator.agent.application.commands.send_exec import SendExecHandler
    from codebox_orchestrator.agent.application.commands.send_message import SendMessageHandler
    from codebox_orchestrator.agent.application.queries.box_files import (
        ListFilesHandler,
        ReadFileHandler,
    )
    from codebox_orchestrator.box.application.commands.cancel_box import CancelBoxHandler
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.box.application.commands.delete_box import DeleteBoxHandler
    from codebox_orchestrator.box.application.commands.restart_box import RestartBoxHandler
    from codebox_orchestrator.box.application.commands.stop_box import StopBoxHandler
    from codebox_orchestrator.box.application.queries.get_box import GetBoxHandler
    from codebox_orchestrator.box.application.queries.get_box_messages import GetBoxMessagesHandler
    from codebox_orchestrator.box.application.queries.list_boxes import ListBoxesHandler
    from codebox_orchestrator.box.application.services.box_lifecycle import BoxLifecycleService
    from codebox_orchestrator.integration.github.application.installation_service import (
        GitHubInstallationService,
    )
    from codebox_orchestrator.integration.github.domain.entities import GitHubInstallation

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
    handler: CreateBoxHandler = Depends(get_create_box),
    lifecycle: BoxLifecycleService = Depends(get_lifecycle),
    github_service: GitHubInstallationService | None = Depends(get_installation_service),
) -> BoxResponse:
    """Create and auto-start a new box."""
    github_installation_id: str | None = None
    github_branch: str | None = None

    if body.github_repo:
        if github_service is None:
            raise HTTPException(400, "GitHub integration is not configured")
        installation = await _find_installation_for_repo(github_service, body.github_repo)
        if installation is None:
            raise HTTPException(400, f"No GitHub installation found for repo: {body.github_repo}")
        github_installation_id = installation.id
        github_branch = f"codebox/manual-{body.github_repo.split('/')[-1]}"

    box = await handler.execute(
        name=body.name,
        provider=body.provider,
        model=body.model,
        dynamic_system_prompt=body.dynamic_system_prompt,
        initial_prompt=body.initial_prompt,
        github_repo=body.github_repo,
        github_branch=github_branch,
        github_installation_id=github_installation_id,
    )
    lifecycle.start_box(box.id)
    return BoxResponse.from_entity(box)


@router.get("/boxes")
async def list_boxes(
    container_status: str | None = None,
    activity: str | None = None,
    trigger: str | None = None,
    handler: ListBoxesHandler = Depends(get_list_boxes),
) -> list[BoxResponse]:
    """List boxes, optionally filtered by container_status, activity, or trigger."""
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
    boxes = await handler.execute(container_status=cs, activity=act, trigger=trigger)
    return [BoxResponse.from_entity(b) for b in boxes]


@router.get("/boxes/{box_id}")
async def get_box(
    box_id: str,
    handler: GetBoxHandler = Depends(get_get_box),
) -> BoxResponse:
    box = await handler.execute(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_entity(box)


@router.get("/boxes/{box_id}/messages")
async def get_box_messages_route(
    box_id: str,
    get_box_handler: GetBoxHandler = Depends(get_get_box),
    messages_handler: GetBoxMessagesHandler = Depends(get_box_messages),
) -> list[BoxMessageResponse]:
    """Return structured chat thread for a box."""
    box = await get_box_handler.execute(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    messages = await messages_handler.execute(box_id)
    return [BoxMessageResponse.from_entity(m) for m in messages]


@router.post("/boxes/{box_id}/stop")
async def stop_box(
    box_id: str,
    handler: StopBoxHandler = Depends(get_stop_box),
    get_box_handler: GetBoxHandler = Depends(get_get_box),
) -> BoxResponse:
    await handler.execute(box_id)
    box = await get_box_handler.execute(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    return BoxResponse.from_entity(box)


@router.post("/boxes/{box_id}/restart")
async def restart_box(
    box_id: str,
    handler: RestartBoxHandler = Depends(get_restart_box),
    lifecycle: BoxLifecycleService = Depends(get_lifecycle),
) -> BoxResponse:
    """Restart a stopped box."""
    try:
        box = await handler.execute(box_id)
    except BoxNotFoundError as exc:
        raise HTTPException(404, "Box not found") from exc
    except InvalidStatusTransitionError as exc:
        raise HTTPException(400, str(exc)) from exc
    lifecycle.start_box(box.id)
    return BoxResponse.from_entity(box)


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


@router.get("/boxes/{box_id}/files")
async def box_list_files(
    box_id: str,
    path: str = "/workspace",
    get_box_handler: GetBoxHandler = Depends(get_get_box),
    handler: ListFilesHandler = Depends(get_list_files),
):
    """List directory contents in a box workspace."""
    box = await get_box_handler.execute(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    try:
        return await handler.execute(box_id, path)
    except NoActiveConnectionError as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, f"Box file proxy error: {exc}") from exc


@router.get("/boxes/{box_id}/files/read")
async def box_read_file(
    box_id: str,
    path: str,
    get_box_handler: GetBoxHandler = Depends(get_get_box),
    handler: ReadFileHandler = Depends(get_read_file),
):
    """Read a file from a box workspace."""
    box = await get_box_handler.execute(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    try:
        return await handler.execute(box_id, path)
    except NoActiveConnectionError as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, f"Box file proxy error: {exc}") from exc


@router.get("/boxes/{box_id}/files/download")
async def box_download_file(
    box_id: str,
    path: str,
    get_box_handler: GetBoxHandler = Depends(get_get_box),
    handler: ReadFileHandler = Depends(get_read_file),
):
    """Download a file from a box workspace as raw bytes."""
    box = await get_box_handler.execute(box_id)
    if box is None:
        raise HTTPException(404, "Box not found")
    try:
        data = await handler.execute(box_id, path)
    except NoActiveConnectionError as exc:
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
