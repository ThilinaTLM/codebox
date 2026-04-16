"""Entry point for the orchestrator service."""

from __future__ import annotations

import uvicorn

from codebox_orchestrator.config import settings


def main() -> None:
    uvicorn.run(
        "codebox_orchestrator.api.app:create_app",
        factory=True,
        host=settings.http.host,
        port=settings.http.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
