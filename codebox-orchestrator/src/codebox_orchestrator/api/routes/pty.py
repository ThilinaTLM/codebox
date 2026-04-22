"""WebSocket bridge between the browser (xterm.js) and the sandbox PTY
server.

The route accepts a browser WebSocket, authenticates it with the same
session cookie used by the REST API, opens a yamux stream to the
sandbox's PTY server (port ``PTY_SERVER_PORT``), and translates between
the two:

* Browser text frame  ``{"type":"open"|"resize",...}``  → sandbox OPEN / RESIZE
  frame.
* Browser binary frame (typed input)                     → sandbox STDIN frame.
* Sandbox STDOUT frame                                   → browser binary frame.
* Sandbox EXIT frame                                     → browser text frame
                                                           ``{"type":"exit",...}``
                                                           followed by a normal
                                                           WS close.

No persistence: nothing the user types or the shell prints is written to
``box_events`` or LangGraph state.  A closed WebSocket causes the PTY
server to SIGHUP the shell process group.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import TYPE_CHECKING, Any

from codebox_tunnel import PTY_SERVER_PORT, PTYFrameType, read_frame, write_frame
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from codebox_orchestrator.auth.models import UserStatus
from codebox_orchestrator.auth.service import decode_auth_token
from codebox_orchestrator.tunnel.registry import NoTunnelConnectionError, TunnelDialError

if TYPE_CHECKING:
    from codebox_tunnel import AsyncYamuxStream

    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.tunnel.registry import TunnelRegistry

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Auth + project access check (cookie / header based, like REST)
# ---------------------------------------------------------------------------


class _AuthError(Exception):
    """Authentication/authorization denied.  Carries the WS close code +
    human-readable reason to send back before closing."""

    def __init__(self, code: int, reason: str) -> None:
        super().__init__(reason)
        self.code = code
        self.reason = reason


async def _check_access(websocket: WebSocket, slug: str, box_id: str) -> None:
    """Validate cookie / Bearer auth and project membership.

    Raises ``_AuthFailed`` on any problem.  The caller is responsible for
    closing the websocket with the carried code.
    """
    token = websocket.cookies.get("access_token")
    if not token:
        auth = websocket.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise _AuthError(4401, "Not authenticated")

    payload = decode_auth_token(token)
    if payload is None:
        raise _AuthError(4401, "Invalid or expired token")

    app = websocket.app
    user = await app.state.auth_service.get_user_by_id(
        payload["user_id"], include_disabled=False, include_deleted=False
    )
    if user is None or user.status != UserStatus.ACTIVE:
        raise _AuthError(4401, "User not active")

    project_service = app.state.project_service
    project = await project_service.get_project_by_slug(slug)
    if project is None:
        raise _AuthError(4404, "Project not found")

    is_platform_admin = user.user_type == "admin"
    if project.status == "archived" and not is_platform_admin:
        raise _AuthError(4403, "Project archived")
    if not is_platform_admin:
        member = await project_service.get_member(project.id, user.user_id)
        if member is None:
            raise _AuthError(4403, "Not a project member")

    query_service: BoxQueryService = app.state.query_service
    box = await query_service.get_box(box_id)
    if box is None or box.project_id != project.id:
        raise _AuthError(4404, "Box not found")


# ---------------------------------------------------------------------------
# Uplink / downlink translation
# ---------------------------------------------------------------------------


async def _handle_control_frame(parsed: dict[str, Any], stream: AsyncYamuxStream) -> bool:
    """Translate a browser control JSON frame into a sandbox frame.

    Returns ``False`` if the sandbox write failed (bridge should stop).
    """
    kind = parsed.get("type")
    if kind == "open":
        payload = json.dumps(
            {
                "cols": int(parsed.get("cols", 80)),
                "rows": int(parsed.get("rows", 24)),
                "shell": str(parsed.get("shell", "/bin/bash")),
                "cwd": str(parsed.get("cwd", "/workspace")),
            }
        ).encode()
        try:
            await write_frame(stream, PTYFrameType.OPEN, payload)
        except Exception:
            logger.warning("PTY uplink: OPEN write failed", exc_info=True)
            return False
    elif kind == "resize":
        payload = json.dumps(
            {
                "cols": int(parsed.get("cols", 80)),
                "rows": int(parsed.get("rows", 24)),
            }
        ).encode()
        try:
            await write_frame(stream, PTYFrameType.RESIZE, payload)
        except Exception:
            logger.warning("PTY uplink: RESIZE write failed", exc_info=True)
            return False
    else:
        logger.debug("PTY uplink: unknown control kind %r", kind)
    return True


async def _uplink(websocket: WebSocket, stream: AsyncYamuxStream) -> None:
    """Browser → sandbox.  Runs until the browser closes or sends invalid data."""
    while True:
        try:
            msg = await websocket.receive()
        except WebSocketDisconnect:
            return

        if msg["type"] == "websocket.disconnect":
            return

        text = msg.get("text")
        data = msg.get("bytes")

        if text is not None:
            try:
                parsed: Any = json.loads(text)
            except json.JSONDecodeError:
                logger.debug("PTY uplink: invalid JSON text frame, ignored")
                continue
            if not isinstance(parsed, dict):
                continue
            if not await _handle_control_frame(parsed, stream):
                return
        elif data is not None:
            try:
                await write_frame(stream, PTYFrameType.STDIN, bytes(data))
            except Exception:
                logger.warning("PTY uplink: STDIN write failed", exc_info=True)
                return


async def _downlink(websocket: WebSocket, stream: AsyncYamuxStream) -> None:
    """Sandbox → browser.  Runs until the sandbox sends EXIT or the stream errors."""
    while True:
        try:
            ftype, payload = await read_frame(stream)
        except (asyncio.IncompleteReadError, ConnectionResetError, OSError, EOFError):
            return
        except ValueError:
            logger.warning("PTY downlink: malformed frame from sandbox")
            return

        if ftype == PTYFrameType.STDOUT:
            try:
                await websocket.send_bytes(payload)
            except Exception:
                return
        elif ftype == PTYFrameType.EXIT:
            with contextlib.suppress(Exception):
                text = payload.decode("utf-8", errors="replace") or "{}"
                try:
                    info = json.loads(text)
                except json.JSONDecodeError:
                    info = {"exit_code": -1, "signal": None}
                info["type"] = "exit"
                await websocket.send_text(json.dumps(info))
            return
        else:
            # Server-originated frame types are STDOUT and EXIT only.
            logger.debug("PTY downlink: ignored frame type %#x", ftype)


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


async def _send_error_exit(websocket: WebSocket, message: str) -> None:
    """Best-effort send of a user-visible error as an ``exit`` control frame."""
    with contextlib.suppress(Exception):
        await websocket.send_text(
            json.dumps({"type": "exit", "exit_code": -1, "signal": None, "error": message})
        )


async def _run_bridge(websocket: WebSocket, stream: AsyncYamuxStream) -> None:
    """Run uplink + downlink until either side terminates, then clean up."""
    uplink = asyncio.create_task(_uplink(websocket, stream), name="pty-uplink")
    downlink = asyncio.create_task(_downlink(websocket, stream), name="pty-downlink")
    try:
        _done, pending = await asyncio.wait(
            {uplink, downlink}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        for task in pending:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
    finally:
        for task in (uplink, downlink):
            if not task.done():
                task.cancel()


@router.websocket("/api/projects/{slug}/boxes/{box_id}/pty")
async def pty_websocket(websocket: WebSocket, slug: str, box_id: str) -> None:
    """Open an interactive PTY session for a box.

    The client (xterm.js in the browser) speaks the text/binary protocol
    described in this module's docstring.
    """
    try:
        await _check_access(websocket, slug, box_id)
    except _AuthError as exc:
        await websocket.close(code=exc.code, reason=exc.reason)
        return

    await websocket.accept()
    logger.info("PTY WebSocket accepted slug=%s box=%s", slug, box_id)

    registry: TunnelRegistry = websocket.app.state.tunnel_registry
    try:
        stream = await registry.open_stream(box_id, PTY_SERVER_PORT)
    except NoTunnelConnectionError:
        await _send_error_exit(websocket, "Box not reachable (tunnel not connected)")
        await websocket.close(code=1011, reason="Tunnel not connected")
        return
    except TunnelDialError as exc:
        await _send_error_exit(websocket, f"PTY server unavailable: {exc}")
        await websocket.close(code=1011, reason="PTY server unavailable")
        return

    try:
        await _run_bridge(websocket, stream)
    finally:
        with contextlib.suppress(Exception):
            await stream.close()
        if websocket.client_state != WebSocketState.DISCONNECTED:
            with contextlib.suppress(Exception):
                await websocket.close(code=1000)
        logger.info("PTY WebSocket closed slug=%s box=%s", slug, box_id)
