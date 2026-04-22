"""Shared agent streaming and exec logic.

Provides generic functions that accept an async send callback,
so they can be used from any transport (gRPC, direct calls, etc.).
"""

from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessageChunk, HumanMessage, ToolMessage

from codebox_agent.events import make_event, new_id

if TYPE_CHECKING:
    from codebox_agent.sessions import SessionManager

logger = logging.getLogger(__name__)

SendFn = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]

_MAX_TOOL_OUTPUT = 2000


def _extract_thinking_text(chunk: AIMessageChunk) -> str:
    """Extract thinking/reasoning text from a message chunk."""
    parts: list[str] = []
    if isinstance(chunk.content, list):
        for block in chunk.content:
            if isinstance(block, dict) and block.get("type") == "thinking":
                text = block.get("thinking", "")
                if text:
                    parts.append(text)
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


def _parse_command_from_args(raw_args: str) -> str:
    if not raw_args:
        return ""
    try:
        parsed = json.loads(raw_args)
    except Exception:
        return ""
    if isinstance(parsed, dict):
        command = parsed.get("command", "")
        return command if isinstance(command, str) else ""
    return ""


def _extract_exit_code(output: str) -> int:
    marker = "Exit code:"
    if marker not in output:
        return 0
    tail = output.rsplit(marker, 1)[-1].strip().splitlines()[0]
    try:
        return int(tail)
    except Exception:
        return 0


async def run_agent_stream(  # noqa: PLR0912, PLR0915
    send: SendFn,
    session_id: str,
    manager: SessionManager,
    new_message: str,
    *,
    run_id: str | None = None,
    input_message_id: str | None = None,
    emit_input_event: bool = False,
) -> None:
    """Stream canonical agent events for a single user message."""
    logger.info("Agent stream starting for session %s", session_id)
    session = manager.get(session_id)
    run_id = run_id or new_id("run")
    input_message_id = input_message_id or new_id("msg")

    ai_text_buffer = ""
    active_tool_calls: dict[str, str] = {}
    tool_args_buffers: dict[str, str] = {}
    tool_args_completed: set[str] = set()
    tool_command_ids: dict[str, str] = {}

    turn_id = ""
    message_id = ""
    message_buffer = ""
    reasoning_open = False
    message_open = False
    turn_open = False
    turn_started_sent = False

    def _new_turn() -> tuple[str, str]:
        return new_id("turn"), new_id("msg")

    async def _close_reasoning() -> None:
        nonlocal reasoning_open
        if reasoning_open:
            await send(
                make_event(
                    "reasoning.completed",
                    run_id=run_id,
                    turn_id=turn_id,
                    message_id=message_id,
                )
            )
            reasoning_open = False

    async def _close_message() -> None:
        nonlocal message_open, message_buffer
        if message_open:
            await send(
                make_event(
                    "message.completed",
                    run_id=run_id,
                    turn_id=turn_id,
                    message_id=message_id,
                    payload={"role": "assistant", "content": message_buffer},
                )
            )
            message_open = False
            message_buffer = ""

    async def _close_turn() -> None:
        nonlocal turn_open, turn_id, message_id, turn_started_sent
        if turn_open:
            await _close_reasoning()
            await _close_message()
            if turn_started_sent:
                await send(make_event("turn.completed", run_id=run_id, turn_id=turn_id))
            turn_open = False
            turn_started_sent = False
            turn_id = ""
            message_id = ""

    def _ensure_turn() -> None:
        nonlocal turn_open, turn_id, message_id, turn_started_sent
        if not turn_open:
            turn_id, message_id = _new_turn()
            turn_open = True
            turn_started_sent = False

    async def _ensure_turn_started() -> None:
        nonlocal turn_started_sent
        _ensure_turn()
        if not turn_started_sent:
            await send(make_event("turn.started", run_id=run_id, turn_id=turn_id))
            turn_started_sent = True

    config = {
        "configurable": {"thread_id": session_id},
        "recursion_limit": session.recursion_limit,
    }

    # Snapshot existing message IDs so the "updates" handler skips
    # messages that already existed before this run.  Without this,
    # every prior assistant/tool message in the checkpoint gets
    # re-emitted as a brand-new turn on each subsequent run.
    try:
        _prior_state = await session.agent.aget_state(config)
        _prior_msg_ids: set[str] = set()
        if _prior_state and _prior_state.values:
            for _m in _prior_state.values.get("messages", []):
                _mid = getattr(_m, "id", None)
                if _mid:
                    _prior_msg_ids.add(_mid)
    except Exception:
        _prior_msg_ids = set()

    if emit_input_event:
        await send(
            make_event(
                "message.completed",
                run_id=run_id,
                message_id=input_message_id,
                payload={"role": "user", "content": new_message},
            )
        )

    await send(
        make_event(
            "run.started",
            run_id=run_id,
            payload={"trigger": "user_message", "input": new_message},
        )
    )
    await send(make_event("state.changed", run_id=run_id, payload={"activity": "agent_working"}))

    try:
        async for part in session.agent.astream(
            {"messages": [HumanMessage(content=new_message)]},
            config=config,
            stream_mode=["messages", "custom", "updates"],
            version="v2",
        ):
            chunk_type = part["type"] if isinstance(part, dict) else None

            if chunk_type == "messages":
                msg_chunk, _metadata = part["data"]
                if not isinstance(msg_chunk, AIMessageChunk):
                    continue

                _ensure_turn()
                if not message_id:
                    message_id = new_id("msg")
                if not turn_id:
                    turn_id = new_id("turn")
                await _ensure_turn_started()

                thinking = _extract_thinking_text(msg_chunk)
                if thinking:
                    if not reasoning_open:
                        await send(
                            make_event(
                                "reasoning.started",
                                run_id=run_id,
                                turn_id=turn_id,
                                message_id=message_id,
                            )
                        )
                        reasoning_open = True
                    await send(
                        make_event(
                            "reasoning.delta",
                            run_id=run_id,
                            turn_id=turn_id,
                            message_id=message_id,
                            payload={"text": thinking},
                        )
                    )

                token = _extract_text_token(msg_chunk)
                if token:
                    await _close_reasoning()
                    if not message_open:
                        await send(
                            make_event(
                                "message.started",
                                run_id=run_id,
                                turn_id=turn_id,
                                message_id=message_id,
                                payload={"role": "assistant"},
                            )
                        )
                        message_open = True
                    ai_text_buffer += token
                    message_buffer += token
                    await send(
                        make_event(
                            "message.delta",
                            run_id=run_id,
                            turn_id=turn_id,
                            message_id=message_id,
                            payload={"text": token},
                        )
                    )

                for tc in getattr(msg_chunk, "tool_call_chunks", None) or []:
                    tc_id = tc.get("id") or ""
                    tc_name = tc.get("name") or active_tool_calls.get(tc_id, "")
                    tc_args = tc.get("args", "") if isinstance(tc.get("args", ""), str) else ""
                    if not tc_id or not tc_name:
                        continue
                    _ensure_turn()
                    if not turn_id:
                        turn_id = new_id("turn")
                    await _ensure_turn_started()
                    await _close_reasoning()
                    if tc_id not in active_tool_calls:
                        active_tool_calls[tc_id] = tc_name
                        await send(
                            make_event(
                                "tool_call.started",
                                run_id=run_id,
                                turn_id=turn_id,
                                tool_call_id=tc_id,
                                payload={"name": tc_name},
                            )
                        )
                    if tc_args:
                        tool_args_buffers[tc_id] = tool_args_buffers.get(tc_id, "") + tc_args
                        await send(
                            make_event(
                                "tool_call.arguments.delta",
                                run_id=run_id,
                                turn_id=turn_id,
                                tool_call_id=tc_id,
                                payload={"text": tc_args},
                            )
                        )

            elif chunk_type == "custom":
                data = part["data"]
                if isinstance(data, dict) and data.get("type") == "tool_exec_output":
                    line = data.get("line", "")
                    tool_call_id = next(
                        (
                            tc_id
                            for tc_id, tc_name in active_tool_calls.items()
                            if tc_name == "execute"
                        ),
                        "",
                    )
                    if tool_call_id and tool_call_id not in tool_command_ids:
                        command_id = new_id("cmd")
                        tool_command_ids[tool_call_id] = command_id
                        command = _parse_command_from_args(tool_args_buffers.get(tool_call_id, ""))
                        await send(
                            make_event(
                                "command.started",
                                run_id=run_id,
                                turn_id=turn_id,
                                tool_call_id=tool_call_id,
                                command_id=command_id,
                                payload={
                                    "origin": "agent_tool",
                                    "command": command,
                                    "timeout_seconds": 0,
                                },
                            )
                        )
                    if tool_call_id:
                        await send(
                            make_event(
                                "command.output.delta",
                                run_id=run_id,
                                turn_id=turn_id,
                                tool_call_id=tool_call_id,
                                command_id=tool_command_ids.get(tool_call_id, ""),
                                payload={"text": line},
                            )
                        )

            elif chunk_type == "updates":
                node_updates = part["data"]
                if not isinstance(node_updates, dict):
                    continue

                for node_output in node_updates.values():
                    if not isinstance(node_output, dict):
                        continue
                    messages = node_output.get("messages", [])
                    if hasattr(messages, "value"):
                        messages = messages.value
                    if not isinstance(messages, list):
                        continue

                    for msg in messages:
                        # Skip messages that existed before this run
                        # to avoid re-emitting old assistant/tool turns.
                        _msg_id = getattr(msg, "id", None)
                        if _msg_id and _msg_id in _prior_msg_ids:
                            continue

                        if getattr(msg, "type", "") == "ai":
                            _ensure_turn()
                            await _ensure_turn_started()

                            tool_calls = getattr(msg, "tool_calls", None) or []
                            if tool_calls:
                                for tc in tool_calls:
                                    tc_id = tc.get("id", "")
                                    tc_name = tc.get("name", "")
                                    if not tc_id:
                                        continue
                                    if tc_id not in active_tool_calls:
                                        active_tool_calls[tc_id] = tc_name
                                        await send(
                                            make_event(
                                                "tool_call.started",
                                                run_id=run_id,
                                                turn_id=turn_id,
                                                tool_call_id=tc_id,
                                                payload={"name": tc_name},
                                            )
                                        )
                                    input_str = json.dumps(tc.get("args", {}))
                                    if len(input_str) > 4000:
                                        input_str = input_str[:4000] + "..."
                                    if tc_id not in tool_args_completed:
                                        tool_args_completed.add(tc_id)
                                        tool_args_buffers[tc_id] = input_str
                                        await send(
                                            make_event(
                                                "tool_call.arguments.completed",
                                                run_id=run_id,
                                                turn_id=turn_id,
                                                tool_call_id=tc_id,
                                                payload={"arguments_json": input_str},
                                            )
                                        )
                                        if tc_name == "execute":
                                            command_id = tool_command_ids.get(tc_id, "") or new_id(
                                                "cmd"
                                            )
                                            tool_command_ids[tc_id] = command_id
                                            await send(
                                                make_event(
                                                    "command.started",
                                                    run_id=run_id,
                                                    turn_id=turn_id,
                                                    tool_call_id=tc_id,
                                                    command_id=command_id,
                                                    payload={
                                                        "origin": "agent_tool",
                                                        "command": _parse_command_from_args(
                                                            input_str
                                                        ),
                                                        "timeout_seconds": 0,
                                                    },
                                                )
                                            )
                                await _close_turn()
                                continue

                            if getattr(msg, "content", ""):
                                content = (
                                    msg.content
                                    if isinstance(msg.content, str)
                                    else str(msg.content)
                                )
                                if content and not message_open and not message_buffer:
                                    if not message_id:
                                        message_id = new_id("msg")
                                    await send(
                                        make_event(
                                            "message.started",
                                            run_id=run_id,
                                            turn_id=turn_id,
                                            message_id=message_id,
                                            payload={"role": "assistant"},
                                        )
                                    )
                                    message_open = True
                                    message_buffer = content
                                    ai_text_buffer += content
                                    await send(
                                        make_event(
                                            "message.delta",
                                            run_id=run_id,
                                            turn_id=turn_id,
                                            message_id=message_id,
                                            payload={"text": content},
                                        )
                                    )
                            await _close_turn()
                            continue

                        if isinstance(msg, ToolMessage):
                            tool_name = getattr(msg, "name", "") or ""
                            tc_id = getattr(msg, "tool_call_id", "") or ""
                            output_str = str(msg.content)
                            if len(output_str) > _MAX_TOOL_OUTPUT:
                                output_str = output_str[:_MAX_TOOL_OUTPUT] + "..."

                            if tool_name == "execute":
                                exit_code = _extract_exit_code(output_str)
                                command_id = tool_command_ids.get(tc_id, "") or new_id("cmd")
                                tool_command_ids[tc_id] = command_id
                                event_kind = (
                                    "command.failed" if exit_code != 0 else "command.completed"
                                )
                                payload = {
                                    "origin": "agent_tool",
                                    "exit_code": exit_code,
                                    "output": output_str,
                                }
                                if exit_code != 0:
                                    payload["error"] = f"Command failed with exit code {exit_code}"
                                await send(
                                    make_event(
                                        event_kind,
                                        run_id=run_id,
                                        turn_id=turn_id,
                                        tool_call_id=tc_id,
                                        command_id=command_id,
                                        payload=payload,
                                    )
                                )

                            tool_event_kind = (
                                "tool_call.failed"
                                if tool_name == "execute" and _extract_exit_code(output_str) != 0
                                else "tool_call.completed"
                            )
                            payload = {"name": tool_name, "output": output_str}
                            if tool_event_kind == "tool_call.failed":
                                payload["error"] = f"Tool {tool_name} failed"
                            await send(
                                make_event(
                                    tool_event_kind,
                                    run_id=run_id,
                                    turn_id=turn_id,
                                    tool_call_id=tc_id,
                                    payload=payload,
                                )
                            )
                            active_tool_calls.pop(tc_id, None)

        await _close_turn()
        final_text = ai_text_buffer.strip()
        await send(make_event("run.completed", run_id=run_id, payload={"summary": final_text}))
        await send(
            make_event(
                "outcome.declared",
                run_id=run_id,
                payload={"status": "completed", "message": final_text[:500]},
            )
        )
        await send(make_event("state.changed", run_id=run_id, payload={"activity": "idle"}))

    except asyncio.CancelledError:
        await _close_turn()
        await send(make_event("run.cancelled", run_id=run_id))
        await send(make_event("state.changed", run_id=run_id, payload={"activity": "idle"}))
        raise

    except Exception as exc:
        logger.exception("Agent stream error for session %s", session_id)
        await _close_turn()
        await send(make_event("run.failed", run_id=run_id, payload={"error": str(exc)}))
        await send(
            make_event(
                "outcome.declared",
                run_id=run_id,
                payload={"status": "unable_to_proceed", "message": str(exc)},
            )
        )
        await send(make_event("state.changed", run_id=run_id, payload={"activity": "idle"}))


async def run_exec(
    send: SendFn,
    command: str,
    session_id: str,
    manager: SessionManager,
    request_id: str = "",
    workspace_root: Path = Path("/workspace"),
    *,
    run_id: str | None = None,
    command_id: str | None = None,
    emit_started_event: bool = False,
) -> None:
    """Execute a shell command and stream output via canonical events.

    Used today only for container init scripts driven by the orchestrator
    via ``ExecQuery``.  Interactive user shell activity flows through a
    separate PTY tunnel and does **not** pass through this function; it is
    deliberately not persisted to the event log or to LangGraph state.
    """
    logger.info("Exec command for session %s: %s", session_id, command[:200])
    run_id = run_id or new_id("run")
    command_id = command_id or new_id("cmd")
    # ``manager`` is kept on the signature for API stability; the exec
    # path no longer needs the session state.
    del manager

    await send(
        make_event(
            "state.changed",
            run_id=run_id,
            command_id=command_id,
            payload={"activity": "exec_shell"},
        )
    )
    if emit_started_event:
        await send(
            make_event(
                "command.started",
                run_id=run_id,
                command_id=command_id,
                payload={
                    "origin": "user_exec",
                    "command": command,
                    "timeout_seconds": 0,
                },
            )
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
                make_event(
                    "command.output.delta",
                    run_id=run_id,
                    command_id=command_id,
                    payload={"text": decoded},
                )
            )

        await proc.wait()
        exit_code = proc.returncode or 0
        full_output = "".join(output_lines)
        if len(full_output) > 10000:
            full_output = full_output[:10000] + "\n... (truncated)"
        shell_output_content = f"Exit code: {exit_code}\n\n{full_output}"

        event_kind = "command.failed" if exit_code != 0 else "command.completed"
        payload = {
            "origin": "user_exec",
            "exit_code": exit_code,
            "output": shell_output_content,
        }
        if exit_code != 0:
            payload["error"] = f"Command failed with exit code {exit_code}"
        await send(
            make_event(
                event_kind,
                run_id=run_id,
                command_id=command_id,
                payload=payload,
            )
        )
        if request_id:
            await send({"type": "exec_done", "output": str(exit_code), "request_id": request_id})
        await send(
            make_event(
                "state.changed",
                run_id=run_id,
                command_id=command_id,
                payload={"activity": "idle"},
            )
        )

    except asyncio.CancelledError:
        if proc and proc.returncode is None:
            proc.kill()
            await proc.wait()
        await send(make_event("run.cancelled", run_id=run_id, command_id=command_id))
        if request_id:
            await send({"type": "exec_done", "output": "cancelled", "request_id": request_id})
        await send(
            make_event(
                "state.changed",
                run_id=run_id,
                command_id=command_id,
                payload={"activity": "idle"},
            )
        )
        raise

    except Exception as exc:
        logger.exception("Exec error for session %s", session_id)
        await send(
            make_event(
                "command.failed",
                run_id=run_id,
                command_id=command_id,
                payload={
                    "origin": "user_exec",
                    "exit_code": 1,
                    "error": str(exc),
                    "output": "",
                },
            )
        )
        if request_id:
            await send({"type": "exec_done", "output": "1", "request_id": request_id})
        await send(
            make_event(
                "state.changed",
                run_id=run_id,
                command_id=command_id,
                payload={"activity": "idle"},
            )
        )


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
