# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo for a sandboxed AI coding agent platform. Seven sub-projects:

- **codebox-agent** — Portable AI agent foundation (LangGraph + deepagents). Shared library used by runners.
- **codebox-sandbox** — Container runner: packages codebox-agent with Devbox toolchains into a Docker image, connects to orchestrator via gRPC
- **codebox-github-action** — GitHub Action runner: triggers codebox-agent from issue comments on GitHub Actions
- **codebox-orchestrator** — Backend API service (FastAPI) that manages "boxes" (sandbox containers with AI agents), relays events between containers and clients
- **codebox-cli** — CLI client that connects to the orchestrator for box management and interactive chat
- **codebox-web-ui** — React frontend (TanStack Start + shadcn) that connects to the orchestrator via REST + WebSocket
- **demo-deepagents** — Standalone terminal demo, same agent framework without Docker

## Architecture

```
[codebox-web-ui]  --(REST + WS)--> [codebox-orchestrator] --(gRPC)--> [sandbox containers (codebox-sandbox)]
[codebox-cli]     --(REST + WS)--> [codebox-orchestrator] --(gRPC)--> [sandbox containers (codebox-sandbox)]
[GitHub Issues]   --(webhook)----> [codebox-github-action on GitHub Actions runner]
```

All runners share **codebox-agent** as the foundation:
```
codebox-agent (portable: agent, tools, sessions, prompts)
  ├── codebox-sandbox   (container runner: gRPC callback + Devbox environment)
  └── codebox-github-action (GitHub Actions runner: issue comment → agent → PR)
```

### Domain Model

The central concept is a **Box** — a container with an AI model that you interact with via chat. Boxes unify the former "Task" and "Sandbox" concepts:

- **Box**: Container + AI agent. Three-dimensional status model:
  - `container_status`: `starting`, `running`, `stopped` (system-managed)
  - `activity`: `idle`, `agent_working`, `exec_shell` (system-managed — what's happening in the box right now)
  - `task_outcome`: `completed`, `in_progress`, `need_clarification`, `unable_to_proceed`, `not_enough_context` (agent-managed via `set_status` tool)
  - `container_stop_reason` (nullable): `user_stopped`, `container_error`, `orchestrator_shutdown`
  - `initial_prompt` (optional): If set, auto-sent to agent on container start. If null, box starts idle awaiting user messages.
  - `trigger` (nullable): "github_issue", "github_pr", or null for manual creation (metadata only, no behavioral branching).
  - Stopped containers can be restarted with thread history restored.
- **BoxEvent**: Persisted event stream (token, tool_start, tool_end, done, error, etc.)
- **FeedbackRequest**: Human-in-the-loop questions from the agent

### API Endpoints

- REST: `/api/boxes/*` (CRUD + message + files + restart), `/api/containers/*`, `/api/github/*`
- WS: `/api/boxes/{id}/ws` (client relay)
- gRPC: port 50051 (sandbox ↔ orchestrator bidirectional streaming)

## How to Run

**Full stack (orchestrator + web-ui):**
```bash
docker compose up
```
- Orchestrator: http://localhost:8080
- Web UI: http://localhost:3000

**Development (separate terminals):**
```bash
# Orchestrator
cd codebox-orchestrator && python -m codebox_orchestrator

# Web UI
cd codebox-web-ui && pnpm dev
```

**CLI:**
```bash
codebox box create --name "My box" --prompt "Write hello world"
codebox box list
codebox box connect <box_id>
```

## Tech Stack

- **codebox-agent**: Python 3.12, LangGraph, deepagents, langchain-openrouter
- **codebox-sandbox**: Python 3.12, gRPC, Devbox/Nix (container toolchain)
- **codebox-github-action**: Python 3.12, gh CLI
- **codebox-orchestrator**: Python 3.12, FastAPI, SQLAlchemy (async SQLite), Docker SDK, websockets
- **codebox-web-ui**: React 19, TanStack Start/Router, Base UI (radix-mira), TanStack Query, Axios, Tailwind v4
- **codebox-cli**: Python 3.12, Click, websockets, Rich, prompt-toolkit

Each Python sub-project has its own `.venv` and `pyproject.toml`. The orchestrator requires `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` env vars (set in `codebox-orchestrator/.env.local`); these are passed to sandbox containers automatically.
