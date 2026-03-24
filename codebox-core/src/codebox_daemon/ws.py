"""WebSocket endpoint for streaming agent interactions."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from codebox_daemon.agent import extract_token
from codebox_daemon.auth import verify_ws_token
from codebox_daemon.schemas import WSClientMessage, WSServerMessage
from codebox_daemon.sessions import SessionManager

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_TOOL_OUTPUT = 2000


async def _send(ws: WebSocket, msg: WSServerMessage) -> None:
    """Send a server message as JSON, ignoring closed connections."""
    try:
        await ws.send_json(msg.model_dump(exclude_none=True))
    except Exception:
        pass


async def _run_agent_stream(
    ws: WebSocket,
    session_id: str,
    manager: SessionManager,
) -> None:
    """Stream agent events over the WebSocket."""
    session = manager.get(session_id)
    ai_text_buffer = ""

    try:
        async for event in session.agent.astream_events(
            {"messages": session.messages}, version="v2"
        ):
            kind = event["event"]

            if kind == "on_chat_model_start":
                ai_text_buffer = ""
                await _send(ws, WSServerMessage(type="model_start"))

            elif kind == "on_tool_start":
                tool_name = event["name"]
                run_id = event.get("run_id", "")
                await _send(ws, WSServerMessage(
                    type="tool_start",
                    name=tool_name,
                    tool_call_id=run_id,
                ))

            elif kind == "on_tool_end":
                tool_name = event["name"]
                output = event["data"].get("output", "")
                output_str = str(
                    output.content if hasattr(output, "content") else output
                )
                if len(output_str) > _MAX_TOOL_OUTPUT:
                    output_str = output_str[:_MAX_TOOL_OUTPUT] + "..."
                await _send(ws, WSServerMessage(
                    type="tool_end",
                    name=tool_name,
                    output=output_str,
                ))

            elif kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    token = extract_token(chunk)
                    if token:
                        ai_text_buffer += token
                        await _send(ws, WSServerMessage(
                            type="token",
                            text=token,
                        ))

        # Stream finished normally
        await _send(ws, WSServerMessage(
            type="done",
            content=ai_text_buffer.strip(),
        ))

        # Append assistant reply to session messages
        if ai_text_buffer.strip():
            session.messages.append({
                "role": "assistant",
                "content": ai_text_buffer.strip(),
            })

    except asyncio.CancelledError:
        # Task was cancelled (user sent "cancel")
        await _send(ws, WSServerMessage(
            type="done",
            content=ai_text_buffer.strip(),
        ))
        if ai_text_buffer.strip():
            session.messages.append({
                "role": "assistant",
                "content": ai_text_buffer.strip(),
            })
        raise

    except Exception as exc:
        logger.exception("Agent stream error for session %s", session_id)
        await _send(ws, WSServerMessage(
            type="error",
            detail=str(exc),
        ))


async def _run_exec(ws: WebSocket, command: str, session_id: str) -> None:
    """Execute a shell command directly and stream output."""
    proc = None
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd="/workspace",
        )

        async for line in proc.stdout:
            await _send(ws, WSServerMessage(
                type="exec_output",
                output=line.decode(errors="replace"),
            ))

        await proc.wait()
        await _send(ws, WSServerMessage(
            type="exec_done",
            output=str(proc.returncode),
        ))

    except asyncio.CancelledError:
        if proc and proc.returncode is None:
            proc.kill()
            await proc.wait()
        await _send(ws, WSServerMessage(type="exec_done", output="cancelled"))
        raise

    except Exception as exc:
        logger.exception("Exec error for session %s", session_id)
        await _send(ws, WSServerMessage(
            type="error",
            detail=str(exc),
        ))


@router.websocket("/api/v1/sessions/{session_id}/ws")
async def session_ws(ws: WebSocket, session_id: str) -> None:
    """WebSocket endpoint for real-time agent interaction."""
    # Validate token from query param
    token = ws.query_params.get("token", "")
    if not verify_ws_token(token):
        await ws.close(code=4001, reason="Invalid or missing auth token")
        return

    manager: SessionManager = ws.app.state.session_manager

    try:
        manager.get(session_id)
    except KeyError:
        await ws.close(code=4004, reason="Session not found")
        return

    await ws.accept()
    logger.info("WebSocket connected for session %s", session_id)

    try:
        while True:
            raw = await ws.receive_json()
            try:
                msg = WSClientMessage.model_validate(raw)
            except Exception as exc:
                await _send(ws, WSServerMessage(
                    type="error",
                    detail=f"Invalid message: {exc}",
                ))
                continue

            session = manager.get(session_id)
            session.last_active_at = datetime.now(timezone.utc)

            if msg.type == "message":
                if not msg.content:
                    await _send(ws, WSServerMessage(
                        type="error",
                        detail="Empty message content",
                    ))
                    continue

                session.messages.append({
                    "role": "user",
                    "content": msg.content,
                })

                task = asyncio.create_task(
                    _run_agent_stream(ws, session_id, manager)
                )
                session.current_task = task
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                finally:
                    session.current_task = None

            elif msg.type == "exec":
                if not msg.content:
                    await _send(ws, WSServerMessage(
                        type="error",
                        detail="Empty exec command",
                    ))
                    continue

                task = asyncio.create_task(
                    _run_exec(ws, msg.content, session_id)
                )
                session.current_task = task
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                finally:
                    session.current_task = None

            elif msg.type == "cancel":
                if session.current_task and not session.current_task.done():
                    session.current_task.cancel()
                    logger.info("Cancelled running task for session %s", session_id)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session %s", session_id)
        session = manager.get(session_id)
        if session.current_task and not session.current_task.done():
            session.current_task.cancel()
    except Exception:
        logger.exception("Unexpected WebSocket error for session %s", session_id)
