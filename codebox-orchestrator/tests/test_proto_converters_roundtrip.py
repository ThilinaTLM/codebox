"""Round-trip tests for ``codebox_agent.proto_converters``.

These tests are the durable safeguard that the dict↔proto converters stay
inverse. They live in the orchestrator project because that is where a
``box_pb2`` module is readily importable; the converter logic itself is in
``codebox-agent`` and shared with the sandbox.

Adding a new event ``kind`` requires:

1. extending ``stream_event_to_dict`` and ``dict_to_stream_event`` in
   ``codebox_agent.proto_converters``;
2. adding a new dict to ``_STREAM_EVENT_FIXTURES`` below.

If steps drift apart, the round-trip assertion fails.
"""

from __future__ import annotations

import pytest
from codebox_tunnel.proto_converters import (
    dict_to_stream_event,
    stream_event_to_dict,
)

from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2

_BASE = {
    "seq": 7,
    "event_id": "evt-1",
    "timestamp_ms": 1_700_000_000_000,
    "run_id": "run-1",
    "turn_id": "turn-1",
    "message_id": "msg-1",
    "tool_call_id": "tc-1",
    "command_id": "cmd-1",
}


def _ev(kind: str, payload: dict | None = None) -> dict:
    return {**_BASE, "kind": kind, "payload": payload or {}}


_STREAM_EVENT_FIXTURES: list[dict] = [
    _ev("run.started", {"trigger": "manual", "input": "hi"}),
    _ev("run.completed", {"summary": "ok"}),
    _ev("run.failed", {"error": "boom"}),
    _ev("run.cancelled"),
    _ev("turn.started"),
    _ev("turn.completed"),
    _ev("message.started", {"role": "assistant"}),
    _ev("message.delta", {"text": "hello "}),
    _ev("message.completed", {"role": "assistant", "content": "hello world"}),
    _ev("reasoning.started"),
    _ev("reasoning.delta", {"text": "thinking..."}),
    _ev("reasoning.completed"),
    _ev("tool_call.started", {"name": "read_file"}),
    _ev("tool_call.arguments.delta", {"text": '{"pa'}),
    _ev("tool_call.arguments.completed", {"arguments_json": '{"path":"x"}'}),
    _ev("tool_call.completed", {"name": "read_file", "output": "contents"}),
    _ev(
        "tool_call.failed",
        {"name": "read_file", "error": "missing", "output": ""},
    ),
    _ev(
        "command.started",
        {"origin": "agent_tool", "command": "ls -la", "timeout_seconds": 30},
    ),
    _ev("command.output.delta", {"text": "file1\nfile2\n"}),
    _ev(
        "command.completed",
        {"origin": "user_exec", "exit_code": 0, "output": "done"},
    ),
    _ev(
        "command.failed",
        {"origin": "agent_tool", "exit_code": 2, "error": "no such file", "output": ""},
    ),
    _ev("state.changed", {"activity": "thinking"}),
    _ev("outcome.declared", {"status": "success", "message": "ok"}),
    _ev(
        "input.requested",
        {"message": "Need clarification", "questions": ["q1?", "q2?"]},
    ),
]


@pytest.mark.parametrize("envelope", _STREAM_EVENT_FIXTURES, ids=lambda d: d["kind"])
def test_round_trip_dict_to_proto_to_dict(envelope: dict) -> None:
    """``stream_event_to_dict(dict_to_stream_event(d))`` must equal ``d``."""
    proto = dict_to_stream_event(envelope, box_pb2)
    back = stream_event_to_dict(proto, box_pb2)
    assert back == envelope


def test_unknown_kind_raises() -> None:
    with pytest.raises(ValueError, match="Unknown canonical event kind"):
        dict_to_stream_event(_ev("nope.unknown"), box_pb2)


def test_unknown_proto_oneof_returns_unknown_kind() -> None:
    # An empty StreamEvent has no oneof set; the converter labels it "unknown".
    empty = box_pb2.StreamEvent()
    out = stream_event_to_dict(empty, box_pb2)
    assert out["kind"] == "unknown"
