# codebox-orchestrator

Backend API service for the Codebox platform. Manages sandbox container lifecycle, relays WebSocket events between sandboxes and clients (web UI, CLI).

## What it does

- Spawns and manages Docker sandbox containers
- Creates agent sessions inside sandboxes via REST
- Streams agent events (tokens, tool calls, completions) over WebSocket
- Persists tasks and events to SQLite
- Provides REST API for task CRUD and container management
- Provides WebSocket endpoint for real-time bidirectional communication

## API

### REST endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/tasks` | Create and auto-start a task |
| `GET` | `/api/tasks` | List tasks (optional `?status=` filter) |
| `GET` | `/api/tasks/{id}` | Get a single task |
| `GET` | `/api/tasks/{id}/events` | Get persisted events for a task |
| `POST` | `/api/tasks/{id}/cancel` | Cancel a running task |
| `POST` | `/api/tasks/{id}/feedback` | Send a follow-up message |
| `DELETE` | `/api/tasks/{id}` | Delete a task and its container |
| `GET` | `/api/containers` | List running containers |
| `POST` | `/api/containers/{id}/stop` | Stop a container |

### WebSocket endpoint

`WS /api/tasks/{task_id}/ws`

On connect, replays persisted events from the database, then switches to live streaming. Supports bidirectional communication:

**Server -> Client:** `token`, `tool_start`, `tool_end`, `model_start`, `done`, `error`, `status_change`, `ping`

**Client -> Server:** `message` (follow-up), `cancel`

## Running

```bash
uv sync
uv run python -m codebox_orchestrator
```

## Configuration

Environment variables (loaded from `.env` and `.env.local`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///data/orchestrator.db` | Database connection |
| `CODEBOX_IMAGE` | `codebox-sandbox:latest` | Docker image for sandboxes |
| `CODEBOX_PORT` | `8443` | Port inside sandbox containers |
| `OPENROUTER_API_KEY` | — | API key for LLM |
| `OPENROUTER_MODEL` | — | Default model |
| `WORKSPACE_BASE_DIR` | `/tmp/codebox-workspaces` | Base directory for task workspaces |
| `DOCKER_NETWORK` | `codebox-net` | Docker network name |
| `ORCHESTRATOR_HOST` | `0.0.0.0` | Bind address |
| `ORCHESTRATOR_PORT` | `8080` | Bind port |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed CORS origins (comma-separated) |
