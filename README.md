# Codebox

Codebox is a monorepo for running AI coding agents inside isolated **Boxes**.

It includes a FastAPI orchestrator that manages Box lifecycle, a React web UI for creating and monitoring Boxes, a container runtime that calls back to the orchestrator over gRPC, and a shared agent library used by the sandbox runtime and GitHub Action.

## Architecture

```text
codebox-web-ui  ─┐
                 ├─ REST + SSE ──> codebox-orchestrator ──> Docker/Podman
external tools  ─┘                         │
                                           │ manages Box containers
                                           ▼
                                 codebox-sandbox containers
                                           │
                                           └─ gRPC bidirectional callback
                                              back to orchestrator
                                              running codebox-agent

codebox-github-action ──> codebox-agent
```

## Repository layout

| Path                     | Description                                                            |
| ------------------------ | ---------------------------------------------------------------------- |
| `codebox-orchestrator/`  | FastAPI service — manages Boxes, REST API, SSE streams, gRPC callbacks |
| `codebox-web-ui/`        | TanStack Start + React frontend                                        |
| `codebox-sandbox/`       | Runtime packaged into Box containers                                   |
| `codebox-agent/`         | Shared agent library (LangGraph)                                       |
| `codebox-github-action/` | GitHub Action that uses `codebox-agent`                                |
| `proto/`                 | Protobuf definitions for orchestrator ↔ sandbox communication          |
| `scripts/`               | Repo utilities including protobuf/gRPC code generation                 |

## Getting started

### Prerequisites

- Python 3.12+ and [`uv`](https://docs.astral.sh/uv/)
- Node.js 22+ and `pnpm`
- Docker or Podman
- LLM provider credentials (see orchestrator docs)

### 1) Configure the orchestrator

Copy and edit the orchestrator environment file:

```bash
cp codebox-orchestrator/.env codebox-orchestrator/.env.local
```

Edit `.env.local` with your credentials. See the [orchestrator README](codebox-orchestrator/README.md) for all available settings.

### 2) Build the Box image

```bash
docker build -t codebox-sandbox:latest ./codebox-sandbox
```

### 3) Start the orchestrator

```bash
cd codebox-orchestrator
uv sync
uv run python -m codebox_orchestrator
```

### 4) Start the web UI

```bash
cd codebox-web-ui
pnpm install
pnpm dev
```

## Development

Python lint and typecheck:

```bash
make check   # quick: lint + typecheck
make ci      # full: format-check + lint + typecheck
```

Frontend checks (run from `codebox-web-ui/`):

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Regenerate gRPC stubs after editing `proto/` files:

```bash
python scripts/generate_proto.py
```
