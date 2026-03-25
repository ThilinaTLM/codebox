"""Environment-based configuration for the orchestrator."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project directory
_project_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_dir / ".env")
load_dotenv(_project_dir / ".env.local", override=True)

_default_db = f"sqlite+aiosqlite:///{_project_dir / 'data' / 'orchestrator.db'}"
DATABASE_URL: str = os.environ.get("DATABASE_URL", _default_db)
CODEBOX_IMAGE: str = os.environ.get("CODEBOX_IMAGE", "codebox-sandbox:latest")
OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL: str = os.environ.get("OPENROUTER_MODEL", "")
TAVILY_API_KEY: str = os.environ.get("TAVILY_API_KEY", "")
WORKSPACE_BASE_DIR: str = os.environ.get("WORKSPACE_BASE_DIR", "/tmp/codebox-workspaces")
DOCKER_NETWORK: str = os.environ.get("DOCKER_NETWORK", "codebox-net")
ORCHESTRATOR_CALLBACK_URL: str = os.environ.get("ORCHESTRATOR_CALLBACK_URL", "")
HOST: str = os.environ.get("ORCHESTRATOR_HOST", "0.0.0.0")
PORT: int = int(os.environ.get("ORCHESTRATOR_PORT", "8080"))
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
