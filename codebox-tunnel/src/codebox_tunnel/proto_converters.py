"""Canonical event ⇄ ``box_pb2.StreamEvent`` / ``box_pb2.BoxEvent`` converters.

The orchestrator and sandbox each ship a generated ``box_pb2`` module
(structurally identical, generated from the same ``.proto`` file). To keep
the dict ⇄ proto mapping in one place — and avoid the historical drift
between the two inverse conversion functions — both subprojects import
these helpers from ``codebox-tunnel`` (the only zero-dependency package
shared by both) and pass their own ``box_pb2`` module in via the ``pb``
argument. ``codebox-tunnel`` itself does not depend on ``protobuf`` —
the ``pb`` argument keeps the helper protocol-agnostic.

The dict envelope is the canonical event shape used everywhere in the
codebase (SSE, persistence, websocket bridges).
"""

from __future__ import annotations

from typing import Any


def stream_event_to_dict(ev: Any, pb: Any) -> dict[str, Any]:  # noqa: PLR0912, PLR0915
    """Convert a ``box_pb2.StreamEvent`` to the canonical JSON envelope.

    ``pb`` is the ``box_pb2`` module the proto was constructed from; it is
    used only to map the ``CommandOrigin`` enum value back to a string.
    """
    result: dict[str, Any] = {
        "seq": ev.seq,
        "event_id": ev.event_id,
        "timestamp_ms": ev.timestamp_ms,
        "run_id": ev.run_id,
        "turn_id": ev.turn_id,
        "message_id": ev.message_id,
        "tool_call_id": ev.tool_call_id,
        "command_id": ev.command_id,
        "payload": {},
    }
    field = ev.WhichOneof("payload")
    if field == "run_started":
        result["kind"] = "run.started"
        result["payload"] = {
            "trigger": ev.run_started.trigger,
            "input": ev.run_started.input,
        }
    elif field == "run_completed":
        result["kind"] = "run.completed"
        result["payload"] = {"summary": ev.run_completed.summary}
    elif field == "run_failed":
        result["kind"] = "run.failed"
        result["payload"] = {"error": ev.run_failed.error}
    elif field == "run_cancelled":
        result["kind"] = "run.cancelled"
    elif field == "turn_started":
        result["kind"] = "turn.started"
    elif field == "turn_completed":
        result["kind"] = "turn.completed"
    elif field == "message_started":
        result["kind"] = "message.started"
        result["payload"] = {"role": ev.message_started.role}
    elif field == "message_delta":
        result["kind"] = "message.delta"
        result["payload"] = {"text": ev.message_delta.text}
    elif field == "message_completed":
        result["kind"] = "message.completed"
        result["payload"] = {
            "role": ev.message_completed.role,
            "content": ev.message_completed.content,
        }
    elif field == "reasoning_started":
        result["kind"] = "reasoning.started"
    elif field == "reasoning_delta":
        result["kind"] = "reasoning.delta"
        result["payload"] = {"text": ev.reasoning_delta.text}
    elif field == "reasoning_completed":
        result["kind"] = "reasoning.completed"
    elif field == "tool_call_started":
        result["kind"] = "tool_call.started"
        result["payload"] = {"name": ev.tool_call_started.name}
    elif field == "tool_call_arguments_delta":
        result["kind"] = "tool_call.arguments.delta"
        result["payload"] = {"text": ev.tool_call_arguments_delta.text}
    elif field == "tool_call_arguments_completed":
        result["kind"] = "tool_call.arguments.completed"
        result["payload"] = {"arguments_json": ev.tool_call_arguments_completed.arguments_json}
    elif field == "tool_call_completed":
        result["kind"] = "tool_call.completed"
        result["payload"] = {
            "name": ev.tool_call_completed.name,
            "output": ev.tool_call_completed.output,
        }
    elif field == "tool_call_failed":
        result["kind"] = "tool_call.failed"
        result["payload"] = {
            "name": ev.tool_call_failed.name,
            "error": ev.tool_call_failed.error,
            "output": ev.tool_call_failed.output,
        }
    elif field == "command_started":
        result["kind"] = "command.started"
        result["payload"] = {
            "origin": _origin_to_str(ev.command_started.origin, pb),
            "command": ev.command_started.command,
            "timeout_seconds": ev.command_started.timeout_seconds,
        }
    elif field == "command_output_delta":
        result["kind"] = "command.output.delta"
        result["payload"] = {"text": ev.command_output_delta.text}
    elif field == "command_completed":
        result["kind"] = "command.completed"
        result["payload"] = {
            "origin": _origin_to_str(ev.command_completed.origin, pb),
            "exit_code": ev.command_completed.exit_code,
            "output": ev.command_completed.output,
        }
    elif field == "command_failed":
        result["kind"] = "command.failed"
        result["payload"] = {
            "origin": _origin_to_str(ev.command_failed.origin, pb),
            "exit_code": ev.command_failed.exit_code,
            "error": ev.command_failed.error,
            "output": ev.command_failed.output,
        }
    elif field == "state_changed":
        result["kind"] = "state.changed"
        result["payload"] = {"activity": ev.state_changed.activity}
    elif field == "outcome_declared":
        result["kind"] = "outcome.declared"
        result["payload"] = {
            "status": ev.outcome_declared.status,
            "message": ev.outcome_declared.message,
        }
    elif field == "input_requested":
        result["kind"] = "input.requested"
        result["payload"] = {
            "message": ev.input_requested.message,
            "questions": list(ev.input_requested.questions),
        }
    else:
        result["kind"] = "unknown"
    return result


def dict_to_stream_event(msg: dict[str, Any], pb: Any) -> Any:  # noqa: PLR0911, PLR0912
    """Convert a canonical event dict to a ``box_pb2.StreamEvent`` proto.

    ``pb`` is the ``box_pb2`` module that owns the message classes.
    Raises :class:`ValueError` for unknown ``kind`` values.
    """
    base = {
        "seq": int(msg.get("seq", 0) or 0),
        "event_id": msg.get("event_id", ""),
        "timestamp_ms": int(msg.get("timestamp_ms", 0) or 0),
        "run_id": msg.get("run_id", ""),
        "turn_id": msg.get("turn_id", ""),
        "message_id": msg.get("message_id", ""),
        "tool_call_id": msg.get("tool_call_id", ""),
        "command_id": msg.get("command_id", ""),
    }
    payload = msg.get("payload", {}) or {}
    kind = msg.get("kind", "")

    if kind == "run.started":
        return pb.StreamEvent(
            **base,
            run_started=pb.RunStarted(
                trigger=payload.get("trigger", ""),
                input=payload.get("input", ""),
            ),
        )
    if kind == "run.completed":
        return pb.StreamEvent(
            **base, run_completed=pb.RunCompleted(summary=payload.get("summary", ""))
        )
    if kind == "run.failed":
        return pb.StreamEvent(**base, run_failed=pb.RunFailed(error=payload.get("error", "")))
    if kind == "run.cancelled":
        return pb.StreamEvent(**base, run_cancelled=pb.RunCancelled())
    if kind == "turn.started":
        return pb.StreamEvent(**base, turn_started=pb.TurnStarted())
    if kind == "turn.completed":
        return pb.StreamEvent(**base, turn_completed=pb.TurnCompleted())
    if kind == "message.started":
        return pb.StreamEvent(
            **base,
            message_started=pb.MessageStarted(role=payload.get("role", "assistant")),
        )
    if kind == "message.delta":
        return pb.StreamEvent(**base, message_delta=pb.MessageDelta(text=payload.get("text", "")))
    if kind == "message.completed":
        return pb.StreamEvent(
            **base,
            message_completed=pb.MessageCompleted(
                role=payload.get("role", "assistant"),
                content=payload.get("content", ""),
            ),
        )
    if kind == "reasoning.started":
        return pb.StreamEvent(**base, reasoning_started=pb.ReasoningStarted())
    if kind == "reasoning.delta":
        return pb.StreamEvent(
            **base, reasoning_delta=pb.ReasoningDelta(text=payload.get("text", ""))
        )
    if kind == "reasoning.completed":
        return pb.StreamEvent(**base, reasoning_completed=pb.ReasoningCompleted())
    if kind == "tool_call.started":
        return pb.StreamEvent(
            **base, tool_call_started=pb.ToolCallStarted(name=payload.get("name", ""))
        )
    if kind == "tool_call.arguments.delta":
        return pb.StreamEvent(
            **base,
            tool_call_arguments_delta=pb.ToolCallArgumentsDelta(text=payload.get("text", "")),
        )
    if kind == "tool_call.arguments.completed":
        return pb.StreamEvent(
            **base,
            tool_call_arguments_completed=pb.ToolCallArgumentsCompleted(
                arguments_json=payload.get("arguments_json", "")
            ),
        )
    if kind == "tool_call.completed":
        return pb.StreamEvent(
            **base,
            tool_call_completed=pb.ToolCallCompleted(
                name=payload.get("name", ""),
                output=payload.get("output", ""),
            ),
        )
    if kind == "tool_call.failed":
        return pb.StreamEvent(
            **base,
            tool_call_failed=pb.ToolCallFailed(
                name=payload.get("name", ""),
                error=payload.get("error", ""),
                output=payload.get("output", ""),
            ),
        )
    if kind == "command.started":
        return pb.StreamEvent(
            **base,
            command_started=pb.CommandStarted(
                origin=_origin_from_str(payload.get("origin", ""), pb),
                command=payload.get("command", ""),
                timeout_seconds=int(payload.get("timeout_seconds", 0) or 0),
            ),
        )
    if kind == "command.output.delta":
        return pb.StreamEvent(
            **base,
            command_output_delta=pb.CommandOutputDelta(text=payload.get("text", "")),
        )
    if kind == "command.completed":
        return pb.StreamEvent(
            **base,
            command_completed=pb.CommandCompleted(
                origin=_origin_from_str(payload.get("origin", ""), pb),
                exit_code=int(payload.get("exit_code", 0) or 0),
                output=payload.get("output", ""),
            ),
        )
    if kind == "command.failed":
        return pb.StreamEvent(
            **base,
            command_failed=pb.CommandFailed(
                origin=_origin_from_str(payload.get("origin", ""), pb),
                exit_code=int(payload.get("exit_code", 1) or 1),
                error=payload.get("error", ""),
                output=payload.get("output", ""),
            ),
        )
    if kind == "state.changed":
        return pb.StreamEvent(
            **base, state_changed=pb.StateChanged(activity=payload.get("activity", ""))
        )
    if kind == "outcome.declared":
        return pb.StreamEvent(
            **base,
            outcome_declared=pb.OutcomeDeclared(
                status=payload.get("status", ""),
                message=payload.get("message", ""),
            ),
        )
    if kind == "input.requested":
        return pb.StreamEvent(
            **base,
            input_requested=pb.InputRequested(
                message=payload.get("message", ""),
                questions=list(payload.get("questions", []) or []),
            ),
        )

    msg_text = f"Unknown canonical event kind: {kind}"
    raise ValueError(msg_text)


def build_exec_query_result(msg: dict[str, Any], pb: Any) -> Any:
    """Build a ``BoxEvent`` carrying an ``ExecResult`` for an ``exec_done`` message."""
    request_id = msg.get("request_id", "")
    output = msg.get("output", "")
    try:
        exit_code = int(output)
    except (ValueError, TypeError):
        exit_code = -1
    return pb.BoxEvent(
        query_result=pb.QueryResult(
            request_id=request_id,
            exec=pb.ExecResult(exit_code=exit_code),
        )
    )


_QUERY_RESULT_BUILDERS: dict[str, Any] = {
    "exec_done": build_exec_query_result,
}


def dict_to_query_result_event(msg: dict[str, Any], pb: Any) -> Any | None:
    """Convert an out-of-band query-result dict to a ``BoxEvent`` (or ``None``)."""
    msg_type = msg.get("type", "")
    builder = _QUERY_RESULT_BUILDERS.get(msg_type)
    if builder is None:
        return None
    return builder(msg, pb)


# ── Helpers ──────────────────────────────────────────────────────


def _origin_to_str(origin: int, pb: Any) -> str:
    if origin == pb.COMMAND_ORIGIN_AGENT_TOOL:
        return "agent_tool"
    if origin == pb.COMMAND_ORIGIN_USER_EXEC:
        return "user_exec"
    return ""


def _origin_from_str(origin: str, pb: Any) -> int:
    if origin == "agent_tool":
        return pb.COMMAND_ORIGIN_AGENT_TOOL
    return pb.COMMAND_ORIGIN_USER_EXEC


__all__ = [
    "build_exec_query_result",
    "dict_to_query_result_event",
    "dict_to_stream_event",
    "stream_event_to_dict",
]
