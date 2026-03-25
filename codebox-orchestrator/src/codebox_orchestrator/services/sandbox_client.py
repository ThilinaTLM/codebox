"""REST + WebSocket client for communicating with sandbox daemons.

Adapted from codebox-cli/src/codebox_cli/client.py — same urllib/websockets
approach with self-signed TLS handling.
"""

from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from typing import Any, AsyncIterator

import websockets
import websockets.asyncio.client


class SandboxClient:
    """Client that talks to a Codebox sandbox daemon over REST and WebSocket."""

    def __init__(
        self,
        host: str,
        port: int,
        token: str = "",
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
    # REST helpers
    # ------------------------------------------------------------------

    def _rest_request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
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
        try:
            resp = self._rest_request("GET", "/health")
            return resp.get("status") == "ok"
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def create_session(
        self,
        model: str | None = None,
        api_key: str | None = None,
        system_prompt: str | None = None,
        working_dir: str = "/workspace",
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"working_dir": working_dir}
        if model:
            payload["model"] = model
        if api_key:
            payload["api_key"] = api_key
        if system_prompt:
            payload["system_prompt"] = system_prompt
        return self._rest_request("POST", "/sessions", payload)

    def delete_session(self, session_id: str) -> dict[str, Any]:
        return self._rest_request("DELETE", f"/sessions/{session_id}")

    # ------------------------------------------------------------------
    # WebSocket interaction
    # ------------------------------------------------------------------

    async def connect_session(
        self, session_id: str
    ) -> websockets.asyncio.client.ClientConnection:
        url = f"{self.base_url}/sessions/{session_id}/ws?token={self.token}"
        return await websockets.connect(url, ssl=self.ssl_context)

    @staticmethod
    async def send_message(
        ws: websockets.asyncio.client.ClientConnection, content: str
    ) -> None:
        await ws.send(json.dumps({"type": "message", "content": content}))

    @staticmethod
    async def send_cancel(
        ws: websockets.asyncio.client.ClientConnection,
    ) -> None:
        await ws.send(json.dumps({"type": "cancel"}))

    @staticmethod
    async def receive_events(
        ws: websockets.asyncio.client.ClientConnection,
    ) -> AsyncIterator[dict[str, Any]]:
        async for raw in ws:
            yield json.loads(raw)
