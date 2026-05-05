"""Protobuf StreamEvent → canonical JSON dict conversion.

Thin wrapper around :func:`codebox_tunnel.proto_converters.stream_event_to_dict`
that pins the ``box_pb2`` module to the orchestrator's generated copy.
"""

from __future__ import annotations

from typing import Any

from codebox_tunnel.proto_converters import stream_event_to_dict as _stream_event_to_dict

from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.box import box_pb2


def stream_event_to_dict(ev: box_pb2.StreamEvent) -> dict[str, Any]:
    """Convert a StreamEvent protobuf to the canonical JSON envelope."""
    return _stream_event_to_dict(ev, box_pb2)


__all__ = ["stream_event_to_dict"]
