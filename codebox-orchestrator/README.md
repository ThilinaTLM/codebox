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

### Platform (admin)

All routes under `/api/platform/*` require the caller to be a platform admin.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/platform/orphan-containers` | List sandbox containers with no live Box backing them |
| `DELETE` | `/api/platform/orphan-containers/{container_id}` | Remove a single orphan container (and its `-app` / `-workspace` volumes) |

An **orphan** is a container labelled `codebox-sandbox=true` that falls into one of:

- `missing` — `codebox.box-id` label points to a `BoxRecord` that does not exist (hard delete, DB restore).
- `deleted` — `BoxRecord` exists but is soft-deleted; the container wasn't cleaned up.
- `unlabeled` — sandbox label is present but `codebox.box-id` is not (manual / legacy).

The scanner assumes a single orchestrator per container-runtime host. Containers younger than `CODEBOX_BOX_ORPHAN_GRACE_SECONDS` (default 60s) are hidden to avoid racing with in-flight Box creation.

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

Environment variables are loaded from `.env` at the orchestrator root. See `.env.example` for a commented template; copy it to `.env` for local development. Everything owned by Codebox uses the `CODEBOX_` prefix; well-known externals (`DATABASE_URL`, `POSTGRES_*`, `GITHUB_TOKEN`) stay bare.

| Variable | Default | Description |
|---|---|---|
| `CODEBOX_ENVIRONMENT` | `development` | `development` disables secret validation. Anything else is treated as a non-development environment and requires the three secrets below. |
| `DATABASE_URL` | `postgresql+asyncpg://codebox:codebox@localhost:5432/codebox` | Database connection (SQLAlchemy URL with async driver) |
| `CODEBOX_BOX_IMAGE` | `codebox-sandbox:latest` | Container image used for Boxes |
| `CODEBOX_BOX_NETWORK` | `codebox-sandbox-net` | Docker/Podman network used by Boxes |
| `CODEBOX_BOX_MEMORY_LIMIT` | `4g` | Per-Box memory limit |
| `CODEBOX_BOX_CPU_LIMIT` | `2` | Per-Box CPU quota (cores) |
| `CODEBOX_BOX_PIDS_LIMIT` | `1024` | Per-Box PID limit |
| `CODEBOX_BOX_ORPHAN_GRACE_SECONDS` | `60` | Grace period for the orphan-container scanner (see `/api/platform/orphan-containers`) |
| `CODEBOX_ORCHESTRATOR_HTTP_HOST` | `0.0.0.0` | HTTP bind host |
| `CODEBOX_ORCHESTRATOR_HTTP_PORT` | `9090` | HTTP bind port |
| `CODEBOX_ORCHESTRATOR_GRPC_PORT` | `50051` | gRPC bind port |
| `CODEBOX_ORCHESTRATOR_URL` | `http://host.docker.internal:${CODEBOX_ORCHESTRATOR_HTTP_PORT}` (Docker) / `host.containers.internal` (Podman) / `localhost` (Windows+Podman) | Public HTTP base URL. Sandboxes derive the WebSocket tunnel URL from it by switching the scheme and appending `/ws/tunnel`. |
| `CODEBOX_ORCHESTRATOR_GRPC_URL` | `grpc://host.docker.internal:${CODEBOX_ORCHESTRATOR_GRPC_PORT}` (Docker) / `host.containers.internal` (Podman) / `localhost` (Windows+Podman) | Public gRPC endpoint sandboxes use for callbacks. Accepts `grpc://`, `grpcs://`, or bare `host:port`. |
| `CODEBOX_ORCHESTRATOR_PUBLIC_URL` | empty | Publicly reachable HTTP base URL used by **external callers** (GitHub, webhooks, browser redirects from github.com). Unlike `CODEBOX_ORCHESTRATOR_URL` (which is for sandbox → orchestrator traffic), this is the URL you'd paste into a GitHub App's webhook configuration. Required for the one-click GitHub App manifest flow. For local dev, point this at your smee.io channel. |
| `CODEBOX_ORCHESTRATOR_UI_URL` | empty | Publicly reachable base URL of the web UI (e.g. `https://codebox.example.com`). Used to redirect the browser back to the project's GitHub settings page after GitHub App manifest creation or installation. When unset, the orchestrator emits a relative redirect, which only works when the UI and API share a host (local dev). |
| `CODEBOX_GRPC_TLS_CERT` | empty | gRPC server certificate PEM |
| `CODEBOX_GRPC_TLS_KEY` | empty | gRPC server private key PEM |
| `CODEBOX_GRPC_TLS_CA_CERT` | empty | CA cert mounted into sandboxes for client-side verification |
| `CODEBOX_GRPC_TLS_ENABLED` | `false` | Force the sandbox to use TLS even without a CA cert (for publicly-signed certs) |
| `CODEBOX_CONTAINER_RUNTIME` | `docker` | `docker` or `podman` |
| `CODEBOX_CONTAINER_RUNTIME_URL` | empty | Explicit Docker/Podman connection URL |
| `CODEBOX_CONTAINER_TLS_VERIFY` | empty | Runtime CA path or `true` / `false` |
| `CODEBOX_CONTAINER_TLS_CERT` | empty | Runtime client cert |
| `CODEBOX_CONTAINER_TLS_KEY` | empty | Runtime client key |
| `CODEBOX_AUTH_SECRET` | development fallback | Auth JWT signing secret |
| `CODEBOX_AUTH_TOKEN_EXPIRY_HOURS` | `168` | Auth cookie/session TTL |
| `CODEBOX_CALLBACK_SECRET` | development fallback | Sandbox callback JWT signing secret |
| `CODEBOX_CALLBACK_TOKEN_EXPIRY_SECONDS` | `3600` | Sandbox callback token TTL |
| `CODEBOX_ENCRYPTION_KEY` | required outside dev | Fernet master key for DB-at-rest encryption |
| `CODEBOX_CORS_ORIGINS` | `http://localhost:3737` | Allowed CORS origins (comma-separated) |
| `CODEBOX_ADMIN_USERNAME` | `admin` | Username for the first-boot Super Admin seed (ignored after any user exists) |
| `CODEBOX_ADMIN_PASSWORD` | random (logged) | Password for the first-boot Super Admin seed (ignored after any user exists) |

### gRPC TLS

By default, gRPC communication between the orchestrator and sandbox containers is unencrypted. In production, enable TLS to protect callback tokens, LLM API keys, and execution results in transit.

Development setup:

```bash
./scripts/generate_grpc_certs.sh
CODEBOX_GRPC_TLS_CERT=certs/server.crt
CODEBOX_GRPC_TLS_KEY=certs/server.key
CODEBOX_GRPC_TLS_CA_CERT=certs/ca.crt
```

### Local GitHub integration

For the GitHub App manifest flow (one-click App registration from the project config page), the orchestrator needs a publicly reachable URL for GitHub to deliver webhooks to and to redirect back from the manifest handshake. In local development, use [smee.io](https://smee.io) to forward webhooks to your laptop:

1. Create a channel at [smee.io](https://smee.io) and copy the channel URL.
2. Set `CODEBOX_ORCHESTRATOR_PUBLIC_URL=https://smee.io/<your-channel>` and start the orchestrator.
3. In a separate terminal, run the smee client to forward webhooks to your orchestrator. The target URL is per-project — replace `<slug>` with your project slug:

   ```bash
   pnpm dlx smee-client -u https://smee.io/<your-channel> \
     --target http://localhost:9090/api/projects/<slug>/github/webhook
   ```

4. Open the project's GitHub settings page in the web UI and click **Create GitHub App**.

If `CODEBOX_ORCHESTRATOR_PUBLIC_URL` is left unset, the manual paste-credentials fallback in the UI still works, but the one-click flow is disabled.

If the web UI is served on a different host than the orchestrator API (e.g. `codebox.example.com` vs `api.codebox.example.com`), also set `CODEBOX_ORCHESTRATOR_UI_URL` to the UI's base URL. Otherwise the post-manifest and post-installation redirects land on the API host and return `{"detail":"Not Found"}`.

### Container runtime

The orchestrator supports Docker and Podman via local sockets, remote TCP/TLS, or SSH.

Examples:

```bash
# Local Docker (default)
# uses /var/run/docker.sock

# Rootless Podman
CODEBOX_CONTAINER_RUNTIME=podman
CODEBOX_CONTAINER_RUNTIME_URL=unix:///run/user/1000/podman/podman.sock

# Remote Docker over TLS
CODEBOX_CONTAINER_RUNTIME_URL=tcp://docker-host:2376
CODEBOX_CONTAINER_TLS_VERIFY=/path/to/ca.pem
CODEBOX_CONTAINER_TLS_CERT=/path/to/cert.pem
CODEBOX_CONTAINER_TLS_KEY=/path/to/key.pem
```
