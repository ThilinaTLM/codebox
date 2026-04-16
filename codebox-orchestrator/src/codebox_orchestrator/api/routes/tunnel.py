"""WebSocket tunnel endpoint + file proxy REST routes.

The WebSocket endpoint ``/ws/tunnel`` is used by sandbox containers to
establish a yamux-multiplexed tunnel back to the orchestrator.  File
proxy routes use that tunnel to reach the sandbox's local file server.
"""

from __future__ import annotations

import json
import logging
import mimetypes
from pathlib import PurePosixPath
from typing import TYPE_CHECKING
from urllib.parse import quote

from codebox_tunnel.protocol import FILE_SERVER_PORT
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, WebSocket
from fastapi.responses import JSONResponse, StreamingResponse

from codebox_orchestrator.agent.infrastructure.callback_token import decode_callback_token
from codebox_orchestrator.project.dependencies import (
    ProjectContext,
    get_project_context,
)
from codebox_orchestrator.tunnel.proxy import proxy_request, proxy_request_streaming
from codebox_orchestrator.tunnel.registry import (
    NoTunnelConnectionError,
    TunnelDialError,
)

if TYPE_CHECKING:
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.tunnel.registry import TunnelRegistry

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Dependency helpers
# ---------------------------------------------------------------------------


def _get_tunnel_registry(request: Request) -> TunnelRegistry:
    return request.app.state.tunnel_registry


def _get_query_service(request: Request) -> BoxQueryService:
    return request.app.state.query_service


async def _require_box(box_id: str, project_id: str, request: Request) -> None:
    """Raise 404 if the box does not exist or does not belong to the project."""
    qs: BoxQueryService = _get_query_service(request)
    box = await qs.get_box(box_id)
    if box is None or box.project_id != project_id:
        raise HTTPException(404, "Box not found")


# ---------------------------------------------------------------------------
# WebSocket endpoint — sandbox connects here
# ---------------------------------------------------------------------------


@router.websocket("/ws/tunnel")
async def tunnel_websocket(websocket: WebSocket) -> None:
    """Accept a WebSocket tunnel connection from a sandbox container.

    Auth is via the ``Authorization: Bearer <callback-jwt>`` header
    (same token used for gRPC).
    """
    # Authenticate
    auth = websocket.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        await websocket.close(code=4001, reason="Missing auth token")
        return
    token = auth[len("Bearer ") :]
    result = decode_callback_token(token)
    if result is None:
        await websocket.close(code=4001, reason="Invalid callback token")
        return

    box_id, _entity_type = result
    await websocket.accept()
    logger.info("Tunnel WebSocket accepted for box %s", box_id)

    # Import here to avoid circular imports at module level
    from codebox_tunnel import AsyncWSAdapter, AsyncYamuxSession  # noqa: PLC0415

    registry: TunnelRegistry = websocket.app.state.tunnel_registry
    adapter = AsyncWSAdapter(websocket)
    session = AsyncYamuxSession(adapter, role="acceptor")
    registry.register(box_id, session)

    try:
        await session.run()  # blocks until connection closes
    except Exception:
        logger.info("Tunnel session ended for box %s", box_id, exc_info=True)
    finally:
        registry.remove(box_id)
        logger.info("Tunnel WebSocket closed for box %s", box_id)


# ---------------------------------------------------------------------------
# File proxy endpoints — frontend calls these (project-scoped)
# ---------------------------------------------------------------------------


@router.get("/api/projects/{slug}/boxes/{box_id}/files")
async def list_files(
    box_id: str,
    path: str = "/workspace",
    *,
    request: Request,
    ctx: ProjectContext = Depends(get_project_context),
) -> JSONResponse:
    """List directory contents in a box workspace via tunnel."""
    await _require_box(box_id, ctx.project_id, request)
    registry = _get_tunnel_registry(request)

    try:
        stream = await registry.open_stream(box_id, FILE_SERVER_PORT)
    except NoTunnelConnectionError as exc:
        raise HTTPException(503, "Tunnel not connected") from exc
    except TunnelDialError as exc:
        raise HTTPException(502, f"Tunnel dial error: {exc}") from exc

    try:
        status, _headers, body = await proxy_request(
            stream, "GET", f"/list?path={quote(path, safe='/')}"
        )
        return JSONResponse(content=json.loads(body), status_code=status)
    except Exception as exc:
        raise HTTPException(502, f"File proxy error: {exc}") from exc


@router.get("/api/projects/{slug}/boxes/{box_id}/files/read")
async def read_file(
    box_id: str,
    path: str,
    *,
    request: Request,
    ctx: ProjectContext = Depends(get_project_context),
) -> JSONResponse:
    """Read a file from a box workspace via tunnel."""
    await _require_box(box_id, ctx.project_id, request)
    registry = _get_tunnel_registry(request)

    try:
        stream = await registry.open_stream(box_id, FILE_SERVER_PORT)
    except NoTunnelConnectionError as exc:
        raise HTTPException(503, "Tunnel not connected") from exc
    except TunnelDialError as exc:
        raise HTTPException(502, f"Tunnel dial error: {exc}") from exc

    try:
        status, _headers, body = await proxy_request(
            stream, "GET", f"/read?path={quote(path, safe='/')}"
        )
        return JSONResponse(content=json.loads(body), status_code=status)
    except Exception as exc:
        raise HTTPException(502, f"File proxy error: {exc}") from exc


@router.get("/api/projects/{slug}/boxes/{box_id}/files/download")
async def download_file(
    box_id: str,
    path: str,
    inline: bool = False,
    *,
    request: Request,
    ctx: ProjectContext = Depends(get_project_context),
) -> StreamingResponse:
    """Download a file from a box workspace via streaming tunnel."""
    await _require_box(box_id, ctx.project_id, request)
    registry = _get_tunnel_registry(request)

    try:
        stream = await registry.open_stream(box_id, FILE_SERVER_PORT)
    except NoTunnelConnectionError as exc:
        raise HTTPException(503, "Tunnel not connected") from exc
    except TunnelDialError as exc:
        raise HTTPException(502, f"Tunnel dial error: {exc}") from exc

    try:
        status, resp_headers, body_iter = await proxy_request_streaming(
            stream, "GET", f"/download?path={quote(path, safe='/')}"
        )
    except Exception as exc:
        raise HTTPException(502, f"File proxy error: {exc}") from exc

    filename = PurePosixPath(path).name
    mime_type, _ = mimetypes.guess_type(path)

    return StreamingResponse(
        body_iter,
        status_code=status,
        media_type=resp_headers.get("content-type", mime_type or "application/octet-stream"),
        headers={
            "Content-Disposition": (
                f'{"inline" if inline else "attachment"}; filename="{filename}"'
            ),
        },
    )


@router.post("/api/projects/{slug}/boxes/{box_id}/files/write")
async def write_file(
    box_id: str,
    path: str,
    request: Request,
    ctx: ProjectContext = Depends(get_project_context),
) -> JSONResponse:
    """Write content to a file in a box workspace via tunnel."""
    await _require_box(box_id, ctx.project_id, request)
    registry = _get_tunnel_registry(request)

    body = await request.body()

    try:
        stream = await registry.open_stream(box_id, FILE_SERVER_PORT)
    except NoTunnelConnectionError as exc:
        raise HTTPException(503, "Tunnel not connected") from exc
    except TunnelDialError as exc:
        raise HTTPException(502, f"Tunnel dial error: {exc}") from exc

    try:
        status, _headers, resp_body = await proxy_request(
            stream,
            "POST",
            f"/write?path={quote(path, safe='/')}",
            body=body,
        )
        return JSONResponse(content=json.loads(resp_body), status_code=status)
    except Exception as exc:
        raise HTTPException(502, f"File proxy error: {exc}") from exc


@router.post("/api/projects/{slug}/boxes/{box_id}/files/upload")
async def upload_file(
    box_id: str,
    path: str,
    file: UploadFile,
    *,
    request: Request,
    ctx: ProjectContext = Depends(get_project_context),
) -> JSONResponse:
    """Upload a file to a box workspace via tunnel."""
    await _require_box(box_id, ctx.project_id, request)
    registry = _get_tunnel_registry(request)

    try:
        stream = await registry.open_stream(box_id, FILE_SERVER_PORT)
    except NoTunnelConnectionError as exc:
        raise HTTPException(503, "Tunnel not connected") from exc
    except TunnelDialError as exc:
        raise HTTPException(502, f"Tunnel dial error: {exc}") from exc

    # Build a simple multipart body for the sandbox file server
    file_content = await file.read()
    filename = file.filename or "uploaded_file"
    boundary = "----CodeboxUploadBoundary"
    multipart_body = (
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: application/octet-stream\r\n"
            f"\r\n"
        ).encode()
        + file_content
        + f"\r\n--{boundary}--\r\n".encode()
    )

    try:
        status, _headers, resp_body = await proxy_request(
            stream,
            "POST",
            f"/upload?path={quote(path, safe='/')}",
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            body=multipart_body,
        )
        return JSONResponse(content=json.loads(resp_body), status_code=status)
    except Exception as exc:
        raise HTTPException(502, f"File proxy error: {exc}") from exc
