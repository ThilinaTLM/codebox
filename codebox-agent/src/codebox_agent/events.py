"""Canonical event helpers for codebox-agent.

The agent runtime emits canonical event dicts with a stable shape:

- kind: event name
- run_id / turn_id / message_id / tool_call_id / command_id: optional scope IDs
- payload: event-specific data

Sequence numbers and timestamps are assigned at the sandbox/orchestrator
boundary when events are persisted and forwarded.
"""

from __future__ import annotations

import uuid
from typing import Any

Activity = str
OutcomeStatus = str


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def make_event(
    kind: str,
    *,
    run_id: str = "",
    turn_id: str = "",
    message_id: str = "",
    tool_call_id: str = "",
    command_id: str = "",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "kind": kind,
        "run_id": run_id,
        "turn_id": turn_id,
        "message_id": message_id,
        "tool_call_id": tool_call_id,
        "command_id": command_id,
        "payload": payload or {},
    }
