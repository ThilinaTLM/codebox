"""Entry point for the orchestrator service."""

from __future__ import annotations

import uvicorn

from codebox_orchestrator.config import HOST, PORT


def main() -> None:
    uvicorn.run(
        "codebox_orchestrator.app:create_app",
        factory=True,
        host=HOST,
        port=PORT,
        log_level="info",
    )


if __name__ == "__main__":
    main()
