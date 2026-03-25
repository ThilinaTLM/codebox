"""Shared agent streaming and exec logic.

Provides generic functions that accept an async send callback,
so they can be used from both the callback client (outbound WS to orchestrator)
and any other transport.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Callable, Coroutine

from codebox_daemon.agent import extract_token
from codebox_daemon.sessions import SessionManager

logger = logging.getLogger(__name__)

SendFn = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

_MAX_TOOL_OUTPUT = 2000
_WORKSPACE_ROOT = Path("/workspace")
_MAX_FILE_SIZE = 1_048_576  # 1 MB


async def run_agent_stream(
    send: SendFn,
    session_id: str,
    manager: SessionManager,
) -> None:
    """Stream agent events, calling send(msg_dict) for each event."""
    session = manager.get(session_id)
    ai_text_buffer = ""

    try:
        async for event in session.agent.astream_events(
            {"messages": session.messages},
            version="v2",
            config={"recursion_limit": session.recursion_limit},
        ):
            kind = event["event"]

            if kind == "on_chat_model_start":
                ai_text_buffer = ""
                await send({"type": "model_start"})

            elif kind == "on_tool_start":
                tool_name = event["name"]
                run_id = event.get("run_id", "")
                await send({
                    "type": "tool_start",
                    "name": tool_name,
                    "tool_call_id": run_id,
                })

            elif kind == "on_tool_end":
                tool_name = event["name"]
                output = event["data"].get("output", "")
                output_str = str(
                    output.content if hasattr(output, "content") else output
                )
                if len(output_str) > _MAX_TOOL_OUTPUT:
                    output_str = output_str[:_MAX_TOOL_OUTPUT] + "..."
                await send({
                    "type": "tool_end",
                    "name": tool_name,
                    "output": output_str,
                })

            elif kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    token = extract_token(chunk)
                    if token:
                        ai_text_buffer += token
                        await send({"type": "token", "text": token})

        # Stream finished normally
        await send({"type": "done", "content": ai_text_buffer.strip()})

        if ai_text_buffer.strip():
            session.messages.append({
                "role": "assistant",
                "content": ai_text_buffer.strip(),
            })

    except asyncio.CancelledError:
        await send({"type": "done", "content": ai_text_buffer.strip()})
        if ai_text_buffer.strip():
            session.messages.append({
                "role": "assistant",
                "content": ai_text_buffer.strip(),
            })
        raise

    except Exception as exc:
        logger.exception("Agent stream error for session %s", session_id)
        await send({"type": "error", "detail": str(exc)})


async def run_exec(
    send: SendFn,
    command: str,
    session_id: str,
) -> None:
    """Execute a shell command and stream output via send callback."""
    proc = None
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd="/workspace",
        )

        async for line in proc.stdout:
            await send({
                "type": "exec_output",
                "output": line.decode(errors="replace"),
            })

        await proc.wait()
        await send({"type": "exec_done", "output": str(proc.returncode)})

    except asyncio.CancelledError:
        if proc and proc.returncode is None:
            proc.kill()
            await proc.wait()
        await send({"type": "exec_done", "output": "cancelled"})
        raise

    except Exception as exc:
        logger.exception("Exec error for session %s", session_id)
        await send({"type": "error", "detail": str(exc)})


def _validate_workspace_path(raw_path: str) -> Path:
    """Resolve a path and ensure it lives under /workspace."""
    resolved = Path(raw_path).resolve()
    if not (resolved == _WORKSPACE_ROOT or _WORKSPACE_ROOT in resolved.parents):
        raise ValueError("Path must be under /workspace")
    return resolved


async def handle_list_files(
    send: SendFn,
    path: str,
    request_id: str,
) -> None:
    """List directory contents and send result back."""
    try:
        dir_path = _validate_workspace_path(path)

        if not dir_path.exists():
            await send({
                "type": "list_files_result",
                "request_id": request_id,
                "error": f"Path not found: {path}",
            })
            return
        if not dir_path.is_dir():
            await send({
                "type": "list_files_result",
                "request_id": request_id,
                "error": f"Not a directory: {path}",
            })
            return

        entries = []
        for child in sorted(dir_path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            try:
                stat = child.stat()
                entries.append({
                    "name": child.name,
                    "path": str(child),
                    "is_dir": child.is_dir(),
                    "size": stat.st_size if child.is_file() else None,
                })
            except OSError:
                continue

        await send({
            "type": "list_files_result",
            "request_id": request_id,
            "data": {"path": str(dir_path), "entries": entries},
        })

    except Exception as exc:
        await send({
            "type": "list_files_result",
            "request_id": request_id,
            "error": str(exc),
        })


async def handle_read_file(
    send: SendFn,
    path: str,
    request_id: str,
) -> None:
    """Read file content and send result back."""
    try:
        file_path = _validate_workspace_path(path)

        if not file_path.exists():
            await send({
                "type": "read_file_result",
                "request_id": request_id,
                "error": f"File not found: {path}",
            })
            return
        if not file_path.is_file():
            await send({
                "type": "read_file_result",
                "request_id": request_id,
                "error": f"Not a file: {path}",
            })
            return

        size = file_path.stat().st_size
        truncated = size > _MAX_FILE_SIZE
        content = file_path.read_text(errors="replace")
        if truncated:
            content = content[:_MAX_FILE_SIZE]

        await send({
            "type": "read_file_result",
            "request_id": request_id,
            "data": {
                "path": str(file_path),
                "content": content,
                "size": size,
                "truncated": truncated,
            },
        })

    except Exception as exc:
        await send({
            "type": "read_file_result",
            "request_id": request_id,
            "error": str(exc),
        })
