"""URL helpers shared by the orchestrator and the sandbox.

The orchestrator advertises two public URLs to each Box:

    CODEBOX_ORCHESTRATOR_URL        http(s)://host[:port]
    CODEBOX_ORCHESTRATOR_GRPC_URL   grpc(s)://host:port

These helpers convert them into the concrete endpoints the Box actually
dials (a ``host:port`` string for gRPC, a ``ws(s)://.../ws/tunnel`` URL
for the tunnel WebSocket).
"""

from __future__ import annotations

_TUNNEL_PATH = "/ws/tunnel"
_GRPC_SCHEMES = ("grpcs://", "grpc://")


def normalize_grpc_url(grpc_url: str) -> str:
    """Strip any ``grpc://`` / ``grpcs://`` scheme, returning ``host:port``.

    Accepts bare ``host:port`` as well.  Trailing slashes are removed.

    >>> normalize_grpc_url("grpc://host:50051")
    'host:50051'
    >>> normalize_grpc_url("grpcs://host:50051/")
    'host:50051'
    >>> normalize_grpc_url("host:50051")
    'host:50051'
    """
    value = grpc_url.strip().rstrip("/")
    for scheme in _GRPC_SCHEMES:
        if value.startswith(scheme):
            return value[len(scheme) :]
    return value


def http_to_ws_url(http_url: str) -> str:
    """Convert an ``http(s)://`` URL to the corresponding ``ws(s)://`` URL.

    Host, port, and path are preserved.  Other schemes pass through
    unchanged (so ``ws://...`` and ``wss://...`` URLs are safe to feed in).

    >>> http_to_ws_url("http://host:9090")
    'ws://host:9090'
    >>> http_to_ws_url("https://codebox.example.com/")
    'wss://codebox.example.com/'
    >>> http_to_ws_url("ws://host:9090")
    'ws://host:9090'
    """
    value = http_url.strip()
    if value.startswith("https://"):
        return "wss://" + value[len("https://") :]
    if value.startswith("http://"):
        return "ws://" + value[len("http://") :]
    return value


def compose_tunnel_url(http_url: str) -> str:
    """Return the full WebSocket tunnel URL from the orchestrator HTTP base URL.

    >>> compose_tunnel_url("http://host:9090")
    'ws://host:9090/ws/tunnel'
    >>> compose_tunnel_url("https://codebox.example.com/")
    'wss://codebox.example.com/ws/tunnel'
    """
    if not http_url.strip():
        raise ValueError("http_url must not be empty")
    return http_to_ws_url(http_url).rstrip("/") + _TUNNEL_PATH
