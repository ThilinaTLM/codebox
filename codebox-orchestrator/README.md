# codebox-orchestrator

FastAPI backend for Codebox. It manages project-scoped Boxes, persists Box event history, exposes project/admin APIs, and coordinates sandbox containers over gRPC.

## What it does

- Manages Box container lifecycle on Docker/Podman
- Stores projects, memberships, LLM profiles, project settings, and GitHub integration records in PostgreSQL
- Persists canonical Box event streams and Box projections in PostgreSQL
- Exposes a project-scoped REST API under `/api/projects/{slug}/...`
- Streams Box lifecycle and event updates over SSE
- Accepts gRPC callbacks from sandbox containers
- Proxies file access through the Box tunnel

## Domain model

- **Users** authenticate to the platform and can be platform admins or regular users.
- **Projects** are the tenancy boundary.
- **Project members** control access inside a project (`admin` / `contributor`).
- **LLM profiles** and **project settings** are project-scoped.
- **Boxes** belong to projects. Metadata is persisted in the `boxes` table; runtime state comes from Docker + gRPC.
- **Box events** are append-only canonical history. **Box projections** cache current activity/outcome.
- **GitHub installations** and **GitHub events** are project-scoped.

## API summary

### Global / auth

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Global health check |
| `POST` | `/api/auth/login` | Login and set auth cookie |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/auth/me` | Get current user |
| `PATCH` | `/api/auth/me` | Update current user profile |
| `POST` | `/api/auth/change-password` | Change password |
| `GET` | `/api/auth/users` | List users (admin) |
| `POST` | `/api/auth/users` | Create user (admin) |
| `POST` | `/api/auth/users/{user_id}/disable` | Disable user (admin) |
| `POST` | `/api/auth/users/{user_id}/enable` | Enable user (admin) |
| `DELETE` | `/api/auth/users/{user_id}` | Tombstone user (admin) |

### Projects

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects` | List projects visible to current user |
| `GET` | `/api/projects/{slug}` | Get project |
| `PATCH` | `/api/projects/{slug}` | Update project |
| `POST` | `/api/projects/{slug}/archive` | Archive project |
| `POST` | `/api/projects/{slug}/restore` | Restore archived project |
| `DELETE` | `/api/projects/{slug}` | Tombstone project |
| `GET` | `/api/projects/{slug}/members` | List members |
| `POST` | `/api/projects/{slug}/members` | Add member |
| `PATCH` | `/api/projects/{slug}/members/{user_id}` | Update member role |
| `DELETE` | `/api/projects/{slug}/members/{user_id}` | Remove member |
| `GET` | `/api/projects/{slug}/settings` | Get project settings |
| `PATCH` | `/api/projects/{slug}/settings` | Update project settings |

### Boxes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{slug}/health` | Project health check |
| `POST` | `/api/projects/{slug}/boxes` | Create Box |
| `GET` | `/api/projects/{slug}/boxes` | List Boxes |
| `GET` | `/api/projects/{slug}/boxes/{box_id}` | Get Box |
| `PATCH` | `/api/projects/{slug}/boxes/{box_id}` | Update Box metadata |
| `DELETE` | `/api/projects/{slug}/boxes/{box_id}` | Delete Box |
| `GET` | `/api/projects/{slug}/boxes/{box_id}/events` | List persisted Box events |
| `GET` | `/api/projects/{slug}/boxes/{box_id}/logs` | Get Box logs |
| `POST` | `/api/projects/{slug}/boxes/{box_id}/stop` | Stop Box |
| `POST` | `/api/projects/{slug}/boxes/{box_id}/restart` | Restart Box |
| `POST` | `/api/projects/{slug}/boxes/{box_id}/cancel` | Cancel running Box work |
| `POST` | `/api/projects/{slug}/boxes/{box_id}/message` | Send a message to the Box |
| `POST` | `/api/projects/{slug}/boxes/{box_id}/exec` | Execute a command in the Box |

### Files, streaming, models, GitHub

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{slug}/boxes/{box_id}/files` | List files via tunnel |
| `GET` | `/api/projects/{slug}/boxes/{box_id}/files/read` | Read file via tunnel |
| `GET` | `/api/projects/{slug}/boxes/{box_id}/files/download` | Download file via tunnel |
| `POST` | `/api/projects/{slug}/boxes/{box_id}/files/write` | Write file via tunnel |
| `POST` | `/api/projects/{slug}/boxes/{box_id}/files/upload` | Upload file via tunnel |
| `GET` | `/api/projects/{slug}/boxes/{box_id}/stream` | Per-Box SSE stream |
| `GET` | `/api/stream` | Global SSE stream |
| `WS` | `/ws/tunnel` | Box tunnel WebSocket |
| `GET` | `/api/projects/{slug}/models` | List models |
| `POST` | `/api/projects/{slug}/models/preview` | Preview models for raw credentials |
| `GET` | `/api/projects/{slug}/github/status` | GitHub status |
| `POST` | `/api/projects/{slug}/github/webhook` | GitHub webhook receiver |
| `GET` | `/api/projects/{slug}/github/events` | List stored GitHub events |
| `GET` | `/api/projects/{slug}/github/installations` | List GitHub installations |
| `POST` | `/api/projects/{slug}/github/installations` | Add GitHub installation |
| `POST` | `/api/projects/{slug}/github/installations/{id}/sync` | Sync repos for installation |
| `DELETE` | `/api/projects/{slug}/github/installations/{id}` | Remove installation |
| `GET` | `/api/projects/{slug}/github/repos` | List repos |

## Running

Start PostgreSQL from the repo root:

```bash
docker compose up postgres -d
```

Run the orchestrator:

```bash
uv sync
uv run python -m codebox_orchestrator
```

Alembic migrations run automatically at startup.

### First-run admin

On first boot the orchestrator seeds a **Super Admin** user when the users table is empty. Set `CODEBOX_ADMIN_USERNAME` and/or `CODEBOX_ADMIN_PASSWORD` to control the initial credentials; otherwise the username is `admin` and a random password is printed in the logs. These values are only consulted on first boot — after that, admins manage their own password from the account page (`POST /api/auth/change-password`).

Generate the OpenAPI snapshot:

```bash
uv run python scripts/dump_openapi.py
```

## Configuration

Environment variables are loaded from `.env` and `.env.local`.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://codebox:codebox@localhost:5432/codebox` | Database connection |
| `CODEBOX_IMAGE` | `codebox-sandbox:latest` | Sandbox image |
| `ORCHESTRATOR_HOST` | `0.0.0.0` | HTTP bind host |
| `ORCHESTRATOR_PORT` | `9090` | HTTP bind port |
| `GRPC_PORT` | `50051` | gRPC bind port |
| `ORCHESTRATOR_WS_PUBLIC_URL` | `ws://host.docker.internal:${ORCHESTRATOR_PORT}` (Docker) / `host.containers.internal` (Podman) / `localhost` (Windows+Podman) | Base WebSocket URL sandboxes use to dial the orchestrator tunnel. Must use `ws://` or `wss://`; path is appended automatically. |
| `ORCHESTRATOR_GRPC_PUBLIC_URL` | `grpc://host.docker.internal:${GRPC_PORT}` (Docker) / `host.containers.internal` (Podman) / `localhost` (Windows+Podman) | gRPC endpoint sandboxes use for callbacks. Accepts `grpc://host:port`, `grpcs://host:port`, or bare `host:port`. |
| `CORS_ORIGINS` | `http://localhost:3737` | Allowed CORS origins |
| `AUTH_SECRET` | development fallback | Auth JWT signing secret |
| `CALLBACK_SECRET` | development fallback | Sandbox callback JWT signing secret |
| `AUTH_TOKEN_EXPIRY_HOURS` | `168` | Auth cookie/session TTL |
| `CALLBACK_TOKEN_EXPIRY_SECONDS` | `3600` | Sandbox callback token TTL |
| `CODEBOX_ADMIN_USERNAME` | `admin` | Username for the first-boot Super Admin seed (ignored after any user exists) |
| `CODEBOX_ADMIN_PASSWORD` | random (logged) | Password for the first-boot Super Admin seed (ignored after any user exists) |
| `CONTAINER_RUNTIME_URL` | empty | Explicit Docker/Podman connection URL |
| `CONTAINER_RUNTIME_TYPE` | `docker` | `docker` or `podman` |
| `CONTAINER_TLS_VERIFY` | empty | Runtime CA path or `true` / `false` |
| `CONTAINER_TLS_CERT` | empty | Runtime client cert |
| `CONTAINER_TLS_KEY` | empty | Runtime client key |
| `SANDBOX_MEMORY_LIMIT` | `4g` | Per-Box memory limit |
| `SANDBOX_CPU_LIMIT` | `2` | Per-Box CPU quota |
| `SANDBOX_PIDS_LIMIT` | `1024` | Per-Box PID limit |
| `SANDBOX_NETWORK` | `codebox-sandbox-net` | Runtime network |
| `GRPC_TLS_CERT` | empty | Server certificate PEM |
| `GRPC_TLS_KEY` | empty | Server private key PEM |
| `GRPC_TLS_CA_CERT` | empty | CA cert mounted into sandboxes |

### gRPC TLS

By default, gRPC communication between the orchestrator and sandbox containers is unencrypted. In production, enable TLS to protect callback tokens, LLM API keys, and execution results in transit.

Development setup:

```bash
./scripts/generate_grpc_certs.sh
GRPC_TLS_CERT=certs/server.crt
GRPC_TLS_KEY=certs/server.key
GRPC_TLS_CA_CERT=certs/ca.crt
```

### Container runtime

The orchestrator supports Docker and Podman via local sockets, remote TCP/TLS, or SSH.

Examples:

```bash
# Local Docker (default)
# uses /var/run/docker.sock

# Rootless Podman
CONTAINER_RUNTIME_URL=unix:///run/user/1000/podman/podman.sock
CONTAINER_RUNTIME_TYPE=podman

# Remote Docker over TLS
CONTAINER_RUNTIME_URL=tcp://docker-host:2376
CONTAINER_TLS_VERIFY=/path/to/ca.pem
CONTAINER_TLS_CERT=/path/to/cert.pem
CONTAINER_TLS_KEY=/path/to/key.pem
```
