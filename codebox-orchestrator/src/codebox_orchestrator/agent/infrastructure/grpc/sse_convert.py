"""Protobuf → SSE dict conversion for broadcasting to web clients.

This is the only place where protobuf messages are converted to dicts,
and only because SSE subscribers expect JSON-serializable dicts.
"""

from __future__ import annotations

from typing import Any

from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import (
    box_pb2,  # noqa: TC001
)


def agent_output_to_sse(ao: box_pb2.AgentOutput) -> dict[str, Any]:  # noqa: PLR0911
    """Convert an AgentOutput protobuf to an SSE-friendly dict."""
    field = ao.WhichOneof("payload")
    if field == "token":
        return {"type": "token", "text": ao.token.text}
    if field == "thinking":
        return {"type": "thinking_token", "text": ao.thinking.text}
    if field == "model_started":
        return {"type": "model_start"}
    if field == "tool_started":
        ts = ao.tool_started
        return {
            "type": "tool_start",
            "name": ts.name,
            "tool_call_id": ts.tool_call_id,
            "input": ts.input_json,
        }
    if field == "tool_output":
        return {
            "type": "tool_exec_output",
            "output": ao.tool_output.output,
            "tool_call_id": ao.tool_output.tool_call_id,
        }
    if field == "tool_finished":
        return {
            "type": "tool_end",
            "name": ao.tool_finished.name,
            "output": ao.tool_finished.output,
        }
    if field == "message_completed":
        msg = ao.message_completed.message
        result: dict[str, Any] = {
            "type": "message_complete",
            "message": _chat_message_to_sse(msg),
        }
        return result
    if field == "exec_chunk":
        return {
            "type": "exec_output",
            "output": ao.exec_chunk.output,
            "request_id": ao.exec_chunk.request_id,
        }
    return {}


def _chat_message_to_sse(msg: box_pb2.ChatMessage) -> dict[str, Any]:
    """Convert a ChatMessage protobuf to an SSE-friendly dict."""
    result: dict[str, Any] = {
        "role": msg.role,
        "content": msg.content,
    }
    if msg.tool_calls:
        result["tool_calls"] = [
            {"id": tc.id, "name": tc.name, "args_json": tc.args_json} for tc in msg.tool_calls
        ]
    if msg.tool_call_id:
        result["tool_call_id"] = msg.tool_call_id
    if msg.tool_name:
        result["tool_name"] = msg.tool_name
    if msg.metadata_json:
        result["metadata_json"] = msg.metadata_json
    return result
