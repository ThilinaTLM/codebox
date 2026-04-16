from __future__ import annotations

import json
from pathlib import Path

from codebox_orchestrator.api.app import create_app

OUTPUT = Path(__file__).resolve().parent.parent / "openapi.json"


def main() -> None:
    app = create_app()
    schema = app.openapi()
    OUTPUT.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {OUTPUT}")  # noqa: T201


if __name__ == "__main__":
    main()
