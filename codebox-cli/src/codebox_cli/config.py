import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env files from the package's project directory, not CWD
_project_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_dir / ".env")
load_dotenv(_project_dir / ".env.local", override=True)

DEFAULT_IMAGE: str = os.environ.get("CODEBOX_IMAGE", "codebox-sandbox:latest")
DEFAULT_PORT: int = int(os.environ.get("CODEBOX_PORT", "8443"))
CONTAINER_LABEL: str = "codebox-sandbox"
OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL: str = os.environ.get("OPENROUTER_MODEL", "")
