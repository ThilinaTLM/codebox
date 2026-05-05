"""Centralized FastAPI exception handlers for orchestrator domain errors.

Routes used to translate domain exceptions to ``HTTPException`` inline,
duplicating ``NoTunnelConnectionError`` → 503 / ``TunnelDialError`` → 502 /
``BoxNotFoundError`` → 404 mappings across many handlers. The
:func:`register_exception_handlers` function installs a single canonical
mapping on the FastAPI app so route code can let domain exceptions
propagate.

Adding a new mapping
--------------------
Append the (exception class, status code, message factory) tuple to the
``_EXCEPTION_MAPPINGS`` list below and add a ``test_exception_handlers``
case asserting the resulting status code.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.responses import JSONResponse

from codebox_orchestrator.agent.domain.exceptions import NoActiveConnectionError
from codebox_orchestrator.box.domain.exceptions import (
    BoxNotFoundError,
    InvalidStatusTransitionError,
)
from codebox_orchestrator.compute.docker.docker_service import DockerServiceError
from codebox_orchestrator.tunnel.registry import (
    NoTunnelConnectionError,
    TunnelDialError,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from fastapi import FastAPI, Request

# Each entry: (exception type, status code, message builder).
# The message builder receives the exception instance and returns the detail string.
_EXCEPTION_MAPPINGS: list[tuple[type[Exception], int, Callable[[Exception], str]]] = [
    (BoxNotFoundError, 404, lambda _exc: "Box not found"),
    (InvalidStatusTransitionError, 400, str),
    (NoActiveConnectionError, 400, str),
    (NoTunnelConnectionError, 503, lambda _exc: "Tunnel not connected"),
    (TunnelDialError, 502, lambda exc: f"Tunnel dial error: {exc}"),
    (DockerServiceError, 502, lambda exc: f"Docker service error: {exc}"),
]


def _make_handler(
    status_code: int, build_detail: Callable[[Exception], str]
) -> Callable[[Request, Exception], JSONResponse]:
    async def handler(_request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status_code, content={"detail": build_detail(exc)})

    return handler  # type: ignore[return-value]


def register_exception_handlers(app: FastAPI) -> None:
    """Register the canonical domain-exception → HTTP-status mapping on ``app``.

    Idempotent: re-registration overwrites previous handlers for the same
    exception class.
    """
    for exc_type, status_code, build_detail in _EXCEPTION_MAPPINGS:
        app.add_exception_handler(exc_type, _make_handler(status_code, build_detail))


__all__ = ["register_exception_handlers"]
