"""Protobuf StreamEvent → canonical JSON dict conversion."""

from __future__ import annotations

from typing import Any

from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2


def stream_event_to_dict(  # noqa: PLR0912, PLR0915
    ev: box_pb2.StreamEvent,
) -> dict[str, Any]:
    """Convert a StreamEvent protobuf to the canonical JSON envelope."""
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
            "origin": _origin_to_str(ev.command_started.origin),
            "command": ev.command_started.command,
            "timeout_seconds": ev.command_started.timeout_seconds,
        }
    elif field == "command_output_delta":
        result["kind"] = "command.output.delta"
        result["payload"] = {"text": ev.command_output_delta.text}
    elif field == "command_completed":
        result["kind"] = "command.completed"
        result["payload"] = {
            "origin": _origin_to_str(ev.command_completed.origin),
            "exit_code": ev.command_completed.exit_code,
            "output": ev.command_completed.output,
        }
    elif field == "command_failed":
        result["kind"] = "command.failed"
        result["payload"] = {
            "origin": _origin_to_str(ev.command_failed.origin),
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


def _origin_to_str(origin: int) -> str:
    if origin == box_pb2.COMMAND_ORIGIN_AGENT_TOOL:
        return "agent_tool"
    if origin == box_pb2.COMMAND_ORIGIN_USER_EXEC:
        return "user_exec"
    return ""
