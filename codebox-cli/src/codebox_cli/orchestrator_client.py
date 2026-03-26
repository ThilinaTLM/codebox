"""REST and SSE client for the Codebox Orchestrator API."""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import Any, AsyncIterator

import httpx


class OrchestratorClient:
    """Client that communicates with the orchestrator's REST + SSE API."""

    def __init__(self, base_url: str = "http://localhost:8080") -> None:
        self.base_url = base_url.rstrip("/")

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
    # Commands (REST)
    # ------------------------------------------------------------------

    def send_message(self, box_id: str, content: str) -> None:
        """Send a chat message to a box agent via REST."""
        self._rest_request("POST", f"/api/boxes/{box_id}/message", {"message": content})

    def send_exec(self, box_id: str, command: str) -> None:
        """Send a shell command to a box via REST."""
        self._rest_request("POST", f"/api/boxes/{box_id}/exec", {"command": command})

    def send_cancel(self, box_id: str) -> None:
        """Cancel the current operation on a box via REST."""
        self._rest_request("POST", f"/api/boxes/{box_id}/cancel")

    # ------------------------------------------------------------------
    # SSE streaming
    # ------------------------------------------------------------------

    async def stream_events(self, box_id: str) -> AsyncIterator[dict[str, Any]]:
        """Connect to a box's SSE stream and yield parsed events."""
        url = f"{self.base_url}/api/boxes/{box_id}/stream"
        async with httpx.AsyncClient(timeout=None) as http:
            async with http.stream("GET", url) as resp:
                resp.raise_for_status()
                buffer = ""
                async for chunk in resp.aiter_text():
                    buffer += chunk
                    while "\n\n" in buffer:
                        frame, buffer = buffer.split("\n\n", 1)
                        for line in frame.split("\n"):
                            if line.startswith("data: "):
                                data = line[6:]
                                try:
                                    event = json.loads(data)
                                    yield event
                                except json.JSONDecodeError:
                                    pass
