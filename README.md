# Open Coding Agents

A sandboxed AI coding agent platform. Run AI-powered coding sessions inside isolated Docker containers with a streaming WebSocket API, managed through a web dashboard or CLI.

## Architecture

```
[codebox-web-ui]  --(REST + WS)--> [codebox-orchestrator] --(REST + WS)--> [sandbox containers]
[codebox-cli]     --(REST + WS)--> [codebox-orchestrator] --(REST + WS)--> [sandbox containers]
```

## Sub-projects

| Directory | Description |
|---|---|
| **codebox-orchestrator** | Backend API service (FastAPI) — manages sandbox containers, relays WebSocket events between sandboxes and clients |
| **codebox-web-ui** | React frontend (TanStack Start + shadcn) — dashboard, task creation, real-time event streaming |
| **codebox-cli** | CLI client — manages tasks via orchestrator or connects directly to sandbox containers |
| **codebox-core** | FastAPI daemon (REST + WebSocket API) for agent sessions, runs inside sandbox containers |
| **codebox-docker** | Dockerfile packaging codebox-core with Devbox toolchains into a container image |
| **demo-deepagents** | Standalone terminal demo — same agent framework without Docker |

## Requirements

- Python 3.12 + [uv](https://docs.astral.sh/uv/)
- Node.js 22 + pnpm
- Docker
- Environment variables: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`

## Quick Start

### Full stack (Docker Compose)

```bash
docker compose up
```

- Orchestrator API: http://localhost:8080
- Web UI: http://localhost:3000

### Development (separate terminals)

```bash
# Build the sandbox image
cd codebox-docker && docker build -t codebox-sandbox:latest .

# Start the orchestrator
cd codebox-orchestrator && uv sync && uv run python -m codebox_orchestrator

# Start the web UI
cd codebox-web-ui && pnpm install && pnpm dev
```

### CLI

```bash
cd codebox-cli && uv sync

# Via orchestrator
uv run codebox task create --title "My task" --prompt "Write hello world in Python"
uv run codebox task list
uv run codebox task connect <task_id>

# Direct mode (legacy)
uv run codebox spawn --connect
```

## Project Structure

Each Python sub-project has its own `.venv` and `pyproject.toml`, managed with uv. The web UI uses pnpm.
