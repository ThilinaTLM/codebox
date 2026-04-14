# codebox-orchestrator

Backend API service for the Codebox platform. Manages sandbox container lifecycle, relays WebSocket events between sandboxes and clients (web UI, CLI).

## What it does

- Spawns and manages Docker sandbox containers
- Creates agent sessions inside sandboxes via REST
- Streams agent events (tokens, tool calls, completions) over WebSocket
- Persists tasks and events to PostgreSQL
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

Start PostgreSQL (via Docker Compose from the repo root):

```bash
docker compose up postgres -d
```

Then run the orchestrator:

```bash
uv sync
uv run python -m codebox_orchestrator
```

Alembic migrations run automatically at startup.

## Configuration

Environment variables (loaded from `.env` and `.env.local`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://codebox:codebox@localhost:5432/codebox` | Database connection |
| `CODEBOX_IMAGE` | `codebox-sandbox:latest` | Docker image for sandboxes |
| `CODEBOX_PORT` | `8443` | Port inside sandbox containers |
| `OPENROUTER_API_KEY` | — | API key for LLM |
| `OPENROUTER_MODEL` | — | Default model |
| `WORKSPACE_BASE_DIR` | `/tmp/codebox-workspaces` | Base directory for task workspaces |
| `DOCKER_NETWORK` | `codebox-net` | Docker network name |
| `ORCHESTRATOR_HOST` | `0.0.0.0` | Bind address |
| `ORCHESTRATOR_PORT` | `9090` | Bind port |
| `CORS_ORIGINS` | `http://localhost:3737` | Allowed CORS origins (comma-separated) |

### Container runtime

The orchestrator supports Docker and Podman as container runtimes, connecting via local sockets, remote TCP/TLS, or SSH.

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTAINER_RUNTIME_URL` | _(empty — uses `docker.from_env()`)_ | Connection URL for the container runtime |
| `CONTAINER_RUNTIME_TYPE` | `docker` | Runtime type: `docker` or `podman` (controls quirk handling) |
| `CONTAINER_TLS_VERIFY` | _(empty)_ | Path to CA certificate, or `true`/`false` |
| `CONTAINER_TLS_CERT` | _(empty)_ | Path to TLS client certificate |
| `CONTAINER_TLS_KEY` | _(empty)_ | Path to TLS client key |

When `CONTAINER_RUNTIME_URL` is not set, the orchestrator uses `docker.from_env()` which reads the standard `DOCKER_HOST`, `DOCKER_TLS_VERIFY`, and `DOCKER_CERT_PATH` environment variables. Setting `CONTAINER_RUNTIME_URL` explicitly gives you full control over the connection.

#### Examples

**Local Docker** (default — no configuration needed):
```bash
# Uses /var/run/docker.sock automatically
```

**Local Podman (rootless)**:
```bash
CONTAINER_RUNTIME_URL=unix:///run/user/1000/podman/podman.sock
CONTAINER_RUNTIME_TYPE=podman
```

**Local Podman (rootful)**:
```bash
CONTAINER_RUNTIME_URL=unix:///run/podman/podman.sock
CONTAINER_RUNTIME_TYPE=podman
```

**Remote Docker over TCP (no TLS)**:
```bash
CONTAINER_RUNTIME_URL=tcp://docker-host:2375
```

**Remote Docker over TLS**:
```bash
CONTAINER_RUNTIME_URL=tcp://docker-host:2376
CONTAINER_TLS_VERIFY=/path/to/ca.pem
CONTAINER_TLS_CERT=/path/to/cert.pem
CONTAINER_TLS_KEY=/path/to/key.pem
```

**Docker or Podman over SSH**:
```bash
CONTAINER_RUNTIME_URL=ssh://deploy@192.168.1.50
```

**Podman on WSL2** (from Windows host or another WSL distro):
```bash
CONTAINER_RUNTIME_URL=unix:///mnt/wsl/podman-sockets/podman-machine-default/podman-user.sock
CONTAINER_RUNTIME_TYPE=podman
```

#### Podman notes

- Set `CONTAINER_RUNTIME_TYPE=podman` so the orchestrator skips Docker-specific options like `host-gateway` in `extra_hosts`.
- Podman 4.7+ automatically provides `host.containers.internal` for container-to-host communication.
- Rootless Podman sockets are typically at `unix:///run/user/<UID>/podman/podman.sock`.
- Ensure the Podman API service is running: `systemctl --user start podman.socket` (rootless) or `systemctl start podman.socket` (rootful).
