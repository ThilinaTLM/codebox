# Codebox SWE Agents

Codebox is a monorepo for running AI coding agents inside isolated **Boxes**.

It includes:
- a FastAPI orchestrator that manages Box lifecycle
- a React web UI for creating and monitoring Boxes
- a CLI for interacting with the orchestrator
- a container runtime that calls back to the orchestrator over gRPC
- a shared agent library used by the sandbox runtime and GitHub Action

> Older parts of the codebase still use legacy `task` and `sandbox` wording. The current domain term is **Box**.

## Architecture

```text
codebox-web-ui  ─┐
codebox-cli     ─┼─ REST + SSE ──> codebox-orchestrator ──> Docker/Podman
external tools  ─┘                         │
                                           │ manages Box containers
                                           ▼
                                 codebox-sandbox containers
                                           │
                                           └─ gRPC bidirectional callback
                                              back to orchestrator (:50051)
                                              running codebox-agent

codebox-github-action ──> codebox-agent
```

### Runtime flow

1. The orchestrator creates a Box container from the `codebox-sandbox` image.
2. The Box connects back to the orchestrator over gRPC.
3. The web UI and CLI send commands through the orchestrator REST API.
4. Live output is streamed to clients with SSE.
5. Box files, messages, logs, and lifecycle state are exposed through orchestrator endpoints.

## Repository layout

| Path | Purpose |
| --- | --- |
| `codebox-orchestrator/` | FastAPI service that manages Boxes, persists state, exposes REST endpoints, serves SSE streams, and accepts sandbox gRPC callbacks |
| `codebox-web-ui/` | TanStack Start + React frontend for creating, viewing, and chatting with Boxes |
| `codebox-cli/` | CLI client for orchestrator-backed Box workflows |
| `codebox-sandbox/` | Runtime packaged into Box containers; connects to the orchestrator over gRPC and runs the agent |
| `codebox-agent/` | Shared agent foundation built on deepagents/LangGraph |
| `codebox-github-action/` | GitHub Action runner that uses `codebox-agent` |
| `proto/` | Protobuf definitions for orchestrator ↔ sandbox communication |
| `scripts/` | Repo utilities, including protobuf/gRPC code generation |

## Requirements

- Python 3.12+
- [`uv`](https://docs.astral.sh/uv/)
- Node.js 22+
- `pnpm`
- Docker or Podman
- LLM credentials for either:
  - OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`), or
  - OpenAI-compatible providers (`OPENAI_API_KEY`, `OPENAI_MODEL`, optional `OPENAI_BASE_URL`)
- Optional: `TAVILY_API_KEY` for web search

## Quick start

The maintained development workflow is to run each subproject with its local tooling.

### 1) Configure the orchestrator

The orchestrator loads `codebox-orchestrator/.env` and then overrides it with `codebox-orchestrator/.env.local` if present.

Create `codebox-orchestrator/.env.local` with a writable workspace path and your model settings:

```dotenv
WORKSPACE_BASE_DIR=/tmp/codebox-workspaces

# Choose one provider
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=anthropic/claude-sonnet-4

# Optional
TAVILY_API_KEY=your-key
```

OpenAI-compatible setup also works:

```dotenv
WORKSPACE_BASE_DIR=/tmp/codebox-workspaces
LLM_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-5
# OPENAI_BASE_URL=https://your-provider.example/v1
```

### 2) Build the Box image

```bash
docker build -t codebox-sandbox:latest ./codebox-sandbox
```

If you use Podman, build/tag the same image name and set `CONTAINER_RUNTIME_TYPE=podman` in `codebox-orchestrator/.env.local`.

### 3) Start the orchestrator

```bash
cd codebox-orchestrator
uv sync
uv run python -m codebox_orchestrator
```

Default ports:
- REST API + SSE: `http://localhost:9090`
- gRPC callback endpoint: `localhost:50051`

### 4) Start the web UI

```bash
cd codebox-web-ui
pnpm install
pnpm dev
```

The web UI runs on `http://localhost:3737` and talks to `http://localhost:9090` by default.

### 5) Use the CLI

```bash
cd codebox-cli
uv sync

# Create a Box and stream its output
uv run codebox box create --name demo --prompt "Summarize this repository"

# List Boxes
uv run codebox box list

# Reconnect to an existing Box
uv run codebox box connect <box_id>

# Inspect files from a Box workspace
uv run codebox box files <box_id>
uv run codebox box cat <box_id> /workspace/README.md
```

Set `CODEBOX_ORCHESTRATOR_URL` if the CLI should talk to a different orchestrator.

## Key ports

| Port | Service | Notes |
| --- | --- | --- |
| `9090` | `codebox-orchestrator` HTTP | REST API and SSE streams |
| `50051` | `codebox-orchestrator` gRPC | Box callback connection |
| `3737` | `codebox-web-ui` | Local frontend dev server |

## Configuration notes

### Container runtime

The orchestrator supports Docker and Podman.

Useful settings in `codebox-orchestrator/.env.local`:

```dotenv
CONTAINER_RUNTIME_TYPE=docker
# CONTAINER_RUNTIME_URL=
# ORCHESTRATOR_GRPC_ADDRESS=
```

For Podman:

```dotenv
CONTAINER_RUNTIME_TYPE=podman
# CONTAINER_RUNTIME_URL=unix:///run/user/<uid>/podman/podman.sock
```

If Box containers cannot connect back to the orchestrator, set `ORCHESTRATOR_GRPC_ADDRESS` explicitly.

### Workspaces

Each Box gets a workspace on the host under `WORKSPACE_BASE_DIR`. Use a path writable by the orchestrator process.

## Development and validation

### Python

Repo-wide Python checks:

```bash
make check
```

Full Python CI-style checks:

```bash
make ci
```

### Frontend

When editing `codebox-web-ui/`, run its own checks:

```bash
cd codebox-web-ui
pnpm lint
pnpm typecheck
pnpm test
```

## Protobuf / gRPC

Do not hand-edit generated gRPC files.

If you change files under `proto/`, regenerate stubs with:

```bash
python scripts/generate_proto.py
```

## Notes

- `codebox-agent` is the shared agent implementation used by both `codebox-sandbox` and `codebox-github-action`.
- `codebox-sandbox` is not a separate REST service; it is the runtime inside Box containers.
- Live client updates use **SSE**, while Box ↔ orchestrator communication uses **gRPC streaming**.
