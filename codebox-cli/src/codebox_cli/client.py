"""WebSocket and REST client for the Codebox daemon API."""

from __future__ import annotations

import json
import ssl
import urllib.request
import urllib.error
from typing import Any, AsyncIterator

import websockets
import websockets.asyncio.client


class CodeboxClient:
    """Thin async client that talks to a Codebox sandbox daemon."""

    def __init__(
        self,
        host: str,
        port: int,
        token: str,
        verify_ssl: bool = False,
    ) -> None:
        self.base_url = f"wss://{host}:{port}/api/v1"
        self.rest_url = f"https://{host}:{port}/api/v1"
        self.token = token

        self.ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        if not verify_ssl:
            self.ssl_context.check_hostname = False
            self.ssl_context.verify_mode = ssl.CERT_NONE

    # ------------------------------------------------------------------
    # REST helpers (using urllib so we don't need httpx)
    # ------------------------------------------------------------------

    def _rest_request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Perform a synchronous REST request and return parsed JSON."""
        url = f"{self.rest_url}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req, context=self.ssl_context) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode() if exc.fp else str(exc)
            raise RuntimeError(
                f"REST {method} {path} failed ({exc.code}): {detail}"
            ) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Cannot reach daemon at {url}: {exc.reason}"
            ) from exc

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    def check_health(self) -> bool:
        """Return True if the daemon is reachable and healthy."""
        try:
            resp = self._rest_request("GET", "/health")
            return resp.get("status") == "ok"
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    async def create_session(
        self,
        model: str | None = None,
        api_key: str | None = None,
        system_prompt: str | None = None,
        working_dir: str = "/workspace",
    ) -> dict[str, Any]:
        """Create a new chat session via the REST API."""
        payload: dict[str, Any] = {"working_dir": working_dir}
        if model:
            payload["model"] = model
        if api_key:
            payload["api_key"] = api_key
        if system_prompt:
            payload["system_prompt"] = system_prompt
        return self._rest_request("POST", "/sessions", payload)

    async def list_sessions(self) -> list[dict[str, Any]]:
        """List existing sessions."""
        return self._rest_request("GET", "/sessions")  # type: ignore[return-value]

    async def delete_session(self, session_id: str) -> dict[str, Any]:
        """Delete a session by id."""
        return self._rest_request("DELETE", f"/sessions/{session_id}")

    # ------------------------------------------------------------------
    # WebSocket interaction
    # ------------------------------------------------------------------

    async def connect_session(
        self, session_id: str
    ) -> websockets.asyncio.client.ClientConnection:
        """Open a WebSocket connection to an existing session."""
        url = f"{self.base_url}/sessions/{session_id}/ws?token={self.token}"
        return await websockets.connect(url, ssl=self.ssl_context)

    @staticmethod
    async def send_message(
        ws: websockets.asyncio.client.ClientConnection, content: str
    ) -> None:
        """Send a user message over the WebSocket."""
        await ws.send(json.dumps({"type": "message", "content": content}))

    @staticmethod
    async def send_exec(
        ws: websockets.asyncio.client.ClientConnection, command: str
    ) -> None:
        """Send a direct shell command for execution."""
        await ws.send(json.dumps({"type": "exec", "content": command}))

    @staticmethod
    async def send_cancel(
        ws: websockets.asyncio.client.ClientConnection,
    ) -> None:
        """Request cancellation of the current agent turn."""
        await ws.send(json.dumps({"type": "cancel"}))

    @staticmethod
    async def receive_events(
        ws: websockets.asyncio.client.ClientConnection,
    ) -> AsyncIterator[dict[str, Any]]:
        """Async iterator yielding parsed JSON event frames."""
        async for raw in ws:
            yield json.loads(raw)
