"""Shared agent streaming and exec logic.

Provides generic functions that accept an async send callback,
so they can be used from both the callback client (outbound WS to orchestrator)
and any other transport.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import mimetypes
from pathlib import Path
from typing import Any, Callable, Coroutine

from langchain_core.messages import HumanMessage, SystemMessage

from codebox_daemon.agent import extract_token
from codebox_daemon.sessions import SessionManager

logger = logging.getLogger(__name__)

SendFn = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

_MAX_TOOL_OUTPUT = 2000
_WORKSPACE_ROOT = Path("/workspace")
_MAX_FILE_SIZE = 1_048_576  # 1 MB


def _langchain_message_to_dict(msg: Any) -> dict[str, Any]:
    """Convert a LangChain message to a serializable dict for message_complete events."""
    role = getattr(msg, "type", "unknown")
    if role == "ai":
        role = "assistant"
    elif role == "human":
        role = "user"

    result: dict[str, Any] = {
        "role": role,
        "content": msg.content if isinstance(msg.content, str) else str(msg.content),
    }

    # Tool calls on assistant messages
    tool_calls = getattr(msg, "tool_calls", None)
    if tool_calls:
        result["tool_calls"] = [
            {
                "id": tc.get("id", ""),
                "name": tc.get("name", ""),
                "args_json": json.dumps(tc.get("args", {})),
            }
            for tc in tool_calls
        ]

    # Tool result messages
    tool_call_id = getattr(msg, "tool_call_id", None)
    if tool_call_id:
        result["tool_call_id"] = tool_call_id
    tool_name = getattr(msg, "name", None)
    if tool_name and role == "tool":
        result["tool_name"] = tool_name

    # Metadata
    metadata = getattr(msg, "metadata", None) or {}
    if metadata:
        result["metadata_json"] = json.dumps(metadata)

    return result


async def run_agent_stream(
    send: SendFn,
    session_id: str,
    manager: SessionManager,
    new_message: str,
) -> None:
    """Stream agent events, calling send(msg_dict) for each event."""
    logger.info("Agent stream starting for session %s", session_id)
    session = manager.get(session_id)
    ai_text_buffer = ""

    config = {
        "configurable": {"thread_id": session_id},
        "recursion_limit": session.recursion_limit,
    }

    try:
        async for event in session.agent.astream_events(
            {"messages": [HumanMessage(content=new_message)]},
            version="v2",
            config=config,
        ):
            kind = event["event"]

            if kind == "on_chat_model_start":
                ai_text_buffer = ""
                logger.debug("Model invocation started for session %s", session_id)
                await send({"type": "model_start"})

            elif kind == "on_tool_start":
                tool_name = event["name"]
                logger.info("Tool start: %s (session %s)", tool_name, session_id)
                run_id = event.get("run_id", "")
                tool_input = event.get("data", {}).get("input", {})
                input_str = json.dumps(tool_input) if tool_input else ""
                if len(input_str) > 4000:
                    input_str = input_str[:4000] + "..."
                await send({
                    "type": "tool_start",
                    "name": tool_name,
                    "tool_call_id": run_id,
                    "input": input_str,
                })

            elif kind == "on_tool_end":
                tool_name = event["name"]
                logger.info("Tool end: %s (session %s)", tool_name, session_id)
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

            elif kind == "on_chain_end":
                # Emit message_complete for messages produced by completed nodes
                output = event.get("data", {}).get("output", {})
                if isinstance(output, dict):
                    messages = output.get("messages", [])
                    # LangGraph may wrap messages in an Overwrite object
                    if hasattr(messages, "value"):
                        messages = messages.value
                    if not isinstance(messages, list):
                        messages = []
                    for msg in messages:
                        msg_dict = _langchain_message_to_dict(msg)
                        await send({
                            "type": "message_complete",
                            "message": msg_dict,
                        })

        # Stream finished normally
        logger.info("Agent stream completed for session %s", session_id)
        await send({"type": "done", "content": ai_text_buffer.strip()})

    except asyncio.CancelledError:
        await send({"type": "done", "content": ai_text_buffer.strip()})
        raise

    except Exception as exc:
        logger.exception("Agent stream error for session %s", session_id)
        await send({"type": "error", "detail": str(exc)})


async def run_exec(
    send: SendFn,
    command: str,
    session_id: str,
    manager: SessionManager,
    request_id: str = "",
) -> None:
    """Execute a shell command and stream output via send callback.

    Also records the command and its output in the agent's chat thread
    so the agent has full context of what the user did.
    """
    logger.info("Exec command for session %s: %s", session_id, command[:200])
    session = manager.get(session_id)
    config = {"configurable": {"thread_id": session_id}}

    # Record the shell command in the agent's thread
    try:
        await session.agent.aupdate_state(
            config=config,
            values={"messages": [HumanMessage(content=f"! {command}")]},
        )
    except Exception:
        logger.debug("Could not record exec command in thread", exc_info=True)

    # Emit message_complete for the command
    await send({
        "type": "message_complete",
        "message": {
            "role": "user",
            "content": f"! {command}",
            "metadata_json": json.dumps({"type": "shell_command"}),
        },
    })

    proc = None
    output_lines: list[str] = []
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd="/workspace",
        )

        async for line in proc.stdout:
            decoded = line.decode(errors="replace")
            output_lines.append(decoded)
            await send({
                "type": "exec_output",
                "output": decoded,
                "request_id": request_id,
            })

        await proc.wait()
        exit_code = proc.returncode
        await send({"type": "exec_done", "output": str(exit_code), "request_id": request_id})

        # Record output in the agent's thread
        full_output = "".join(output_lines)
        # Truncate to avoid huge messages
        if len(full_output) > 10000:
            full_output = full_output[:10000] + "\n... (truncated)"
        shell_output_content = f"Exit code: {exit_code}\n\n{full_output}"

        try:
            await session.agent.aupdate_state(
                config=config,
                values={"messages": [SystemMessage(content=shell_output_content)]},
            )
        except Exception:
            logger.debug("Could not record exec output in thread", exc_info=True)

        # Emit message_complete for the output
        await send({
            "type": "message_complete",
            "message": {
                "role": "system",
                "content": shell_output_content,
                "metadata_json": json.dumps({"type": "shell_output", "exit_code": exit_code}),
            },
        })

    except asyncio.CancelledError:
        if proc and proc.returncode is None:
            proc.kill()
            await proc.wait()
        await send({"type": "exec_done", "output": "cancelled", "request_id": request_id})
        raise

    except Exception as exc:
        logger.exception("Exec error for session %s", session_id)
        await send({"type": "error", "detail": str(exc)})


def _is_binary_file(path: Path) -> bool:
    """Heuristic: check MIME type and first 8 KB for null bytes."""
    mime, _ = mimetypes.guess_type(str(path))
    if mime and mime.startswith("text/"):
        return False
    try:
        chunk = path.read_bytes()[:8192]
        return b"\x00" in chunk
    except Exception:
        return True


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
    logger.debug("list_files: path=%s, request_id=%s", path, request_id)
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
    logger.debug("read_file: path=%s, request_id=%s", path, request_id)
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
        is_binary = _is_binary_file(file_path)
        truncated = size > _MAX_FILE_SIZE

        if is_binary:
            raw = file_path.read_bytes()
            if truncated:
                raw = raw[:_MAX_FILE_SIZE]
            data = {
                "path": str(file_path),
                "content": "",
                "content_base64": base64.b64encode(raw).decode("ascii"),
                "size": size,
                "truncated": truncated,
                "is_binary": True,
            }
        else:
            content = file_path.read_text(errors="replace")
            if truncated:
                content = content[:_MAX_FILE_SIZE]
            data = {
                "path": str(file_path),
                "content": content,
                "size": size,
                "truncated": truncated,
                "is_binary": False,
            }

        await send({
            "type": "read_file_result",
            "request_id": request_id,
            "data": data,
        })

    except Exception as exc:
        await send({
            "type": "read_file_result",
            "request_id": request_id,
            "error": str(exc),
        })
