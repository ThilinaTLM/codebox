"""Tests for the centralized FastAPI exception handlers.

These tests construct a minimal FastAPI app (no full orchestrator wiring),
register the handlers, and assert that each domain exception maps to the
expected HTTP status code and detail. Adding a new mapping in
``api.exception_handlers`` should also add a case here.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.api.exception_handlers import register_exception_handlers
from codebox_orchestrator.box.domain.exceptions import (
    BoxNotFoundError,
    InvalidStatusTransitionError,
)
from codebox_orchestrator.compute.docker.docker_service import DockerServiceError
from codebox_orchestrator.tunnel.registry import (
    NoTunnelConnectionError,
    TunnelDialError,
)


def _build_client() -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/raise/{name}")
    async def _raise(name: str) -> dict[str, str]:
        match name:
            case "box-not-found":
                raise BoxNotFoundError("box-123")
            case "invalid-transition":
                raise InvalidStatusTransitionError("running", "queued")
            case "no-active-connection":
                raise NoActiveConnectionError("no agent connected")
            case "no-tunnel":
                raise NoTunnelConnectionError("no tunnel for box X")
            case "tunnel-dial":
                raise TunnelDialError("box-1", 9999, 0)
            case "docker":
                raise DockerServiceError("docker daemon unreachable")
        return {"ok": "true"}

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    ("name", "expected_status", "expected_detail_substring"),
    [
        ("box-not-found", 404, "Box not found"),
        ("invalid-transition", 400, "Invalid status transition"),
        ("no-active-connection", 400, "no agent connected"),
        ("no-tunnel", 503, "Tunnel not connected"),
        ("tunnel-dial", 502, "Tunnel dial error:"),
        ("docker", 502, "Docker service error"),
    ],
)
def test_exception_maps_to_status_and_detail(
    name: str, expected_status: int, expected_detail_substring: str
) -> None:
    client = _build_client()
    resp = client.get(f"/raise/{name}")
    assert resp.status_code == expected_status
    body = resp.json()
    assert "detail" in body
    assert expected_detail_substring in body["detail"]
