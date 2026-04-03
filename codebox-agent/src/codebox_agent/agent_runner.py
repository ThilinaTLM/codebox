"""Shared agent streaming and exec logic.

Provides generic functions that accept an async send callback,
so they can be used from any transport (gRPC, direct calls, etc.).
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import mimetypes
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessageChunk, HumanMessage, SystemMessage, ToolMessage

if TYPE_CHECKING:
    from codebox_agent.sessions import SessionManager

logger = logging.getLogger(__name__)

SendFn = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

_MAX_TOOL_OUTPUT = 2000
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


def _extract_thinking_text(chunk: AIMessageChunk) -> str:
    """Extract thinking/reasoning text from a message chunk."""
    parts: list[str] = []
    if isinstance(chunk.content, list):
        for block in chunk.content:
            if isinstance(block, dict) and block.get("type") == "thinking":
                text = block.get("thinking", "")
                if text:
                    parts.append(text)
    # OpenAI-style reasoning
    reasoning = (getattr(chunk, "additional_kwargs", None) or {}).get("reasoning_content")
    if reasoning and isinstance(reasoning, str):
        parts.append(reasoning)
    return "".join(parts)


def _extract_text_token(chunk: AIMessageChunk) -> str:
    """Extract plain text content from a message chunk."""
    if isinstance(chunk.content, str):
        return chunk.content
    if isinstance(chunk.content, list):
        parts: list[str] = []
        for block in chunk.content:
            if isinstance(block, dict):
                btype = block.get("type")
                if btype not in ("thinking", "tool_use"):
                    parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return ""


async def run_agent_stream(  # noqa: PLR0912, PLR0915
    send: SendFn,
    session_id: str,
    manager: SessionManager,
    new_message: str,
) -> None:
    """Stream agent events, calling send(msg_dict) for each event.

    Uses ``.astream()`` with multi-mode (messages + custom + updates) to
    surface LLM tokens, thinking tokens, tool exec streaming, and node
    updates through a single loop.
    """
    logger.info("Agent stream starting for session %s", session_id)
    session = manager.get(session_id)
    ai_text_buffer = ""
    model_started = False
    # tool_call_id -> tool_name for currently running tool calls
    active_tool_calls: dict[str, str] = {}
    # Track tool call IDs that have already been emitted as tool_start
    emitted_tool_starts: set[str] = set()

    config = {
        "configurable": {"thread_id": session_id},
        "recursion_limit": session.recursion_limit,
    }

    await send({"type": "activity_changed", "status": "agent_working"})

    try:
        async for part in session.agent.astream(
            {"messages": [HumanMessage(content=new_message)]},
            config=config,
            stream_mode=["messages", "custom", "updates"],
            version="v2",
        ):
            chunk_type = part["type"] if isinstance(part, dict) else None

            # ── messages mode: LLM tokens, thinking, tool_call chunks ──
            if chunk_type == "messages":
                msg_chunk, _metadata = part["data"]

                if not isinstance(msg_chunk, AIMessageChunk):
                    continue

                # Emit model_start on first chunk of a turn
                if not model_started:
                    model_started = True
                    ai_text_buffer = ""
                    logger.debug("Model invocation started for session %s", session_id)
                    await send({"type": "model_start"})

                # Thinking tokens
                thinking = _extract_thinking_text(msg_chunk)
                if thinking:
                    await send({"type": "thinking_token", "text": thinking})

                # Text tokens
                token = _extract_text_token(msg_chunk)
                if token:
                    ai_text_buffer += token
                    await send({"type": "token", "text": token})

                # Tool call chunks — emit tool_start as soon as we see the name
                for tc in getattr(msg_chunk, "tool_call_chunks", None) or []:
                    tc_id = tc.get("id")
                    tc_name = tc.get("name")
                    if tc_id and tc_name and tc_id not in emitted_tool_starts:
                        emitted_tool_starts.add(tc_id)
                        active_tool_calls[tc_id] = tc_name
                        tc_args = tc.get("args", "")
                        logger.info("Tool start: %s (session %s)", tc_name, session_id)
                        await send(
                            {
                                "type": "tool_start",
                                "name": tc_name,
                                "tool_call_id": tc_id,
                                "input": tc_args if isinstance(tc_args, str) else "",
                            }
                        )

            # ── custom mode: streaming exec output from get_stream_writer() ──
            elif chunk_type == "custom":
                data = part["data"]
                if isinstance(data, dict) and data.get("type") == "tool_exec_output":
                    line = data.get("line", "")
                    # Find the currently active execute tool call
                    tool_call_id = ""
                    for tc_id, tc_name in active_tool_calls.items():
                        if tc_name == "execute":
                            tool_call_id = tc_id
                            break
                    await send(
                        {
                            "type": "tool_exec_output",
                            "output": line,
                            "tool_call_id": tool_call_id,
                        }
                    )

            # ── updates mode: node completions (tool results, final messages) ──
            elif chunk_type == "updates":
                node_updates = part["data"]
                if not isinstance(node_updates, dict):
                    continue

                for node_name, node_output in node_updates.items():
                    if not isinstance(node_output, dict):
                        continue
                    messages = node_output.get("messages", [])
                    if hasattr(messages, "value"):
                        messages = messages.value
                    if not isinstance(messages, list):
                        continue

                    for msg in messages:
                        # AI messages with tool_calls — emit tool_start
                        # with full input (or update if already emitted
                        # early from tool_call_chunks).
                        for tc in getattr(msg, "tool_calls", None) or []:
                            tc_id = tc.get("id", "")
                            tc_name = tc.get("name", "")
                            if not tc_id:
                                continue
                            input_str = json.dumps(tc.get("args", {}))
                            if len(input_str) > 4000:
                                input_str = input_str[:4000] + "..."
                            if tc_id not in emitted_tool_starts:
                                emitted_tool_starts.add(tc_id)
                                active_tool_calls[tc_id] = tc_name
                                logger.info("Tool start: %s (session %s)", tc_name, session_id)
                                await send(
                                    {
                                        "type": "tool_start",
                                        "name": tc_name,
                                        "tool_call_id": tc_id,
                                        "input": input_str,
                                    }
                                )
                            else:
                                # Re-send tool_start with full input
                                await send(
                                    {
                                        "type": "tool_start",
                                        "name": tc_name,
                                        "tool_call_id": tc_id,
                                        "input": input_str,
                                    }
                                )

                        # Tool results → emit tool_end
                        if isinstance(msg, ToolMessage):
                            tool_name = getattr(msg, "name", "") or ""
                            tc_id = getattr(msg, "tool_call_id", "") or ""
                            output_str = str(msg.content)
                            if len(output_str) > _MAX_TOOL_OUTPUT:
                                output_str = output_str[:_MAX_TOOL_OUTPUT] + "..."
                            logger.info("Tool end: %s (session %s)", tool_name, session_id)
                            active_tool_calls.pop(tc_id, None)
                            await send(
                                {
                                    "type": "tool_end",
                                    "name": tool_name,
                                    "output": output_str,
                                }
                            )

                        msg_dict = _langchain_message_to_dict(msg)
                        await send({"type": "message_complete", "message": msg_dict})

                    # Reset model_started when tool node completes
                    # (next model invocation will emit a new model_start)
                    if node_name == "tools":
                        model_started = False

        # Stream finished normally
        logger.info("Agent stream completed for session %s", session_id)
        await send({"type": "done", "content": ai_text_buffer.strip()})
        await send({"type": "activity_changed", "status": "idle"})

    except asyncio.CancelledError:
        await send({"type": "done", "content": ai_text_buffer.strip()})
        await send({"type": "activity_changed", "status": "idle"})
        raise

    except Exception as exc:
        logger.exception("Agent stream error for session %s", session_id)
        await send({"type": "error", "detail": str(exc)})
        await send({"type": "activity_changed", "status": "idle"})


async def run_exec(
    send: SendFn,
    command: str,
    session_id: str,
    manager: SessionManager,
    request_id: str = "",
    workspace_root: Path = Path("/workspace"),
) -> None:
    """Execute a shell command and stream output via send callback.

    Also records the command and its output in the agent's chat thread
    so the agent has full context of what the user did.
    """
    logger.info("Exec command for session %s: %s", session_id, command[:200])
    session = manager.get(session_id)
    config = {"configurable": {"thread_id": session_id}}

    await send({"type": "activity_changed", "status": "exec_shell"})

    # Record the shell command in the agent's thread
    try:
        await session.agent.aupdate_state(
            config=config,
            values={"messages": [HumanMessage(content=f"! {command}")]},
        )
    except Exception:
        logger.debug("Could not record exec command in thread", exc_info=True)

    # Emit message_complete for the command
    await send(
        {
            "type": "message_complete",
            "message": {
                "role": "user",
                "content": f"! {command}",
                "metadata_json": json.dumps({"type": "shell_command"}),
            },
        }
    )

    proc = None
    output_lines: list[str] = []
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(workspace_root),
        )

        async for line in proc.stdout:  # ty: ignore[not-iterable]
            decoded = line.decode(errors="replace")
            output_lines.append(decoded)
            await send(
                {
                    "type": "exec_output",
                    "output": decoded,
                    "request_id": request_id,
                }
            )

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
        await send(
            {
                "type": "message_complete",
                "message": {
                    "role": "system",
                    "content": shell_output_content,
                    "metadata_json": json.dumps({"type": "shell_output", "exit_code": exit_code}),
                },
            }
        )
        await send({"type": "activity_changed", "status": "idle"})

    except asyncio.CancelledError:
        if proc and proc.returncode is None:
            proc.kill()
            await proc.wait()
        await send({"type": "exec_done", "output": "cancelled", "request_id": request_id})
        await send({"type": "activity_changed", "status": "idle"})
        raise

    except Exception as exc:
        logger.exception("Exec error for session %s", session_id)
        await send({"type": "error", "detail": str(exc)})
        await send({"type": "activity_changed", "status": "idle"})


_TEXT_MIME_PREFIXES = (
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/x-sh",
    "application/toml",
    "application/yaml",
    "application/x-yaml",
)


def _is_likely_binary_by_name(filename: str) -> bool:
    """Extension-based binary heuristic — no disk I/O."""
    mime, _ = mimetypes.guess_type(filename)
    if mime is None:
        return False  # unknown = assume text (safe default for code files)
    return not any(mime.startswith(p) for p in _TEXT_MIME_PREFIXES)


def _is_binary_file(path: Path) -> bool:
    """Heuristic: check MIME type and first 8 KB for null bytes."""
    mime, _ = mimetypes.guess_type(str(path))
    if mime and mime.startswith("text/"):
        return False
    try:
        chunk = path.read_bytes()[:8192]
    except Exception:
        return True
    else:
        return b"\x00" in chunk


def _validate_workspace_path(raw_path: str, workspace_root: Path) -> Path:
    """Resolve a path and ensure it lives under the workspace root."""
    resolved = Path(raw_path).resolve()
    if not (resolved == workspace_root or workspace_root in resolved.parents):
        raise ValueError(f"Path must be under {workspace_root}")
    return resolved


async def handle_list_files(
    send: SendFn,
    path: str,
    request_id: str,
    workspace_root: Path = Path("/workspace"),
) -> None:
    """List directory contents and send result back."""
    logger.debug("list_files: path=%s, request_id=%s", path, request_id)
    try:
        dir_path = _validate_workspace_path(path, workspace_root)

        if not dir_path.exists():
            await send(
                {
                    "type": "list_files_result",
                    "request_id": request_id,
                    "error": f"Path not found: {path}",
                }
            )
            return
        if not dir_path.is_dir():
            await send(
                {
                    "type": "list_files_result",
                    "request_id": request_id,
                    "error": f"Not a directory: {path}",
                }
            )
            return

        entries = []
        for child in sorted(dir_path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            try:
                stat = child.stat()
                is_dir = child.is_dir()
                entries.append(
                    {
                        "name": child.name,
                        "path": str(child),
                        "is_dir": is_dir,
                        "size": stat.st_size if child.is_file() else None,
                        "is_binary": not is_dir and _is_likely_binary_by_name(child.name),
                    }
                )
            except OSError:
                continue

        await send(
            {
                "type": "list_files_result",
                "request_id": request_id,
                "data": {"path": str(dir_path), "entries": entries},
            }
        )

    except Exception as exc:
        await send(
            {
                "type": "list_files_result",
                "request_id": request_id,
                "error": str(exc),
            }
        )


async def handle_read_file(
    send: SendFn,
    path: str,
    request_id: str,
    workspace_root: Path = Path("/workspace"),
) -> None:
    """Read file content and send result back."""
    logger.debug("read_file: path=%s, request_id=%s", path, request_id)
    try:
        file_path = _validate_workspace_path(path, workspace_root)

        if not file_path.exists():
            await send(
                {
                    "type": "read_file_result",
                    "request_id": request_id,
                    "error": f"File not found: {path}",
                }
            )
            return
        if not file_path.is_file():
            await send(
                {
                    "type": "read_file_result",
                    "request_id": request_id,
                    "error": f"Not a file: {path}",
                }
            )
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

        await send(
            {
                "type": "read_file_result",
                "request_id": request_id,
                "data": data,
            }
        )

    except Exception as exc:
        await send(
            {
                "type": "read_file_result",
                "request_id": request_id,
                "error": str(exc),
            }
        )
