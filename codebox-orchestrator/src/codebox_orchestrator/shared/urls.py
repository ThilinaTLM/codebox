"""URL helpers for composing sandbox-facing orchestrator endpoints."""

from __future__ import annotations

_TUNNEL_PATH = "/ws/tunnel"
_GRPC_SCHEMES = ("grpcs://", "grpc://")


def compose_tunnel_url(ws_public_url: str) -> str:
    """Compose the sandbox tunnel URL from the orchestrator's WS public base URL.

    >>> compose_tunnel_url("ws://host:9090")
    'ws://host:9090/ws/tunnel'
    >>> compose_tunnel_url("wss://codebox.example.com/")
    'wss://codebox.example.com/ws/tunnel'
    """

    base = ws_public_url.rstrip("/")
    if not base.startswith(("ws://", "wss://")):
        raise ValueError(f"Expected ws:// or wss:// URL, got: {ws_public_url!r}")
    return base + _TUNNEL_PATH


def normalize_grpc_url(grpc_public_url: str) -> str:
    """Normalise a gRPC URL to the ``host:port`` form grpc clients expect.

    Accepts ``grpc://host:port``, ``grpcs://host:port``, or bare
    ``host:port``. Trailing slashes are stripped.
    """

    value = grpc_public_url.strip().rstrip("/")
    for scheme in _GRPC_SCHEMES:
        if value.startswith(scheme):
            return value[len(scheme) :]
    return value
