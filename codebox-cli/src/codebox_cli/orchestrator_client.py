"""REST and WebSocket client for the Codebox Orchestrator API."""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import Any, AsyncIterator

import websockets
import websockets.asyncio.client


class OrchestratorClient:
    """Client that communicates with the orchestrator's REST + WebSocket API."""

    def __init__(self, base_url: str = "http://localhost:8080") -> None:
        self.base_url = base_url.rstrip("/")
        self.ws_url = self.base_url.replace("http://", "ws://").replace("https://", "wss://")

    # ------------------------------------------------------------------
    # REST helpers
    # ------------------------------------------------------------------

    def _rest_request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 204:
                    return None
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode() if exc.fp else str(exc)
            raise RuntimeError(
                f"Orchestrator {method} {path} failed ({exc.code}): {detail}"
            ) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Cannot reach orchestrator at {url}: {exc.reason}"
            ) from exc

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def check_health(self) -> bool:
        try:
            resp = self._rest_request("GET", "/api/health")
            return resp.get("status") == "ok"
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Box CRUD
    # ------------------------------------------------------------------

    def create_box(
        self,
        name: str | None = None,
        initial_prompt: str | None = None,
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if name:
            payload["name"] = name
        if initial_prompt:
            payload["initial_prompt"] = initial_prompt
        if model:
            payload["model"] = model
        if system_prompt:
            payload["system_prompt"] = system_prompt
        return self._rest_request("POST", "/api/boxes", payload)

    def list_boxes(self, status: str | None = None) -> list[dict[str, Any]]:
        path = "/api/boxes"
        if status:
            path += f"?status={status}"
        return self._rest_request("GET", path)

    def get_box(self, box_id: str) -> dict[str, Any]:
        return self._rest_request("GET", f"/api/boxes/{box_id}")

    def stop_box(self, box_id: str) -> dict[str, Any]:
        return self._rest_request("POST", f"/api/boxes/{box_id}/stop")

    def delete_box(self, box_id: str) -> None:
        self._rest_request("DELETE", f"/api/boxes/{box_id}")

    # ------------------------------------------------------------------
    # WebSocket
    # ------------------------------------------------------------------

    async def connect_box(
        self, box_id: str
    ) -> websockets.asyncio.client.ClientConnection:
        """Open a WebSocket connection to stream box events."""
        url = f"{self.ws_url}/api/boxes/{box_id}/ws"
        return await websockets.connect(url)

    @staticmethod
    async def send_message(
        ws: websockets.asyncio.client.ClientConnection, content: str
    ) -> None:
        await ws.send(json.dumps({"type": "message", "content": content}))

    @staticmethod
    async def send_exec(
        ws: websockets.asyncio.client.ClientConnection, command: str
    ) -> None:
        await ws.send(json.dumps({"type": "exec", "content": command}))

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
            event = json.loads(raw)
            if event.get("type") == "ping":
                continue
            yield event
