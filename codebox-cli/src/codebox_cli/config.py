import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env files from the package's project directory, not CWD
_project_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_dir / ".env")
load_dotenv(_project_dir / ".env.local", override=True)

# Orchestrator mode
ORCHESTRATOR_URL: str = os.environ.get("CODEBOX_ORCHESTRATOR_URL", "http://localhost:8080")
