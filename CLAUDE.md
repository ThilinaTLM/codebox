# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo for a sandboxed AI coding agent platform. Six sub-projects:

- **codebox-core** — FastAPI daemon (REST + WebSocket API) for AI agent sessions, runs inside sandbox containers
- **codebox-cli** — CLI client that manages Docker containers directly or connects via the orchestrator
- **codebox-docker** — Dockerfile packaging codebox-core with Devbox toolchains into a container
- **codebox-orchestrator** — Backend API service (FastAPI) that manages sandbox containers, relays WebSocket events between sandboxes and clients (web-ui, cli)
- **codebox-web-ui** — React frontend (TanStack Start + shadcn) that connects to the orchestrator via REST + WebSocket
- **demo-deepagents** — Standalone terminal demo, same agent framework without Docker

## Architecture

```
[codebox-web-ui]  --(REST + WS)--> [codebox-orchestrator] --(REST + WS)--> [sandbox containers (codebox-core)]
[codebox-cli]     --(REST + WS)--> [codebox-orchestrator] --(REST + WS)--> [sandbox containers (codebox-core)]
[codebox-cli]     --(REST + WS)-----------------------------------direct--> [sandbox containers (codebox-core)]
```

The orchestrator spawns Docker containers (built from codebox-docker, which embeds codebox-core), creates sessions, and streams agent events over WebSocket. The web-ui and CLI both connect to the orchestrator for task management, event streaming, and interactive follow-up.

The CLI also supports a direct mode (legacy) where it spawns and connects to sandbox containers without the orchestrator.

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

**CLI via orchestrator:**
```bash
codebox task create --title "My task" --prompt "Write hello world"
codebox task list
codebox task connect <task_id>
```

**CLI direct mode (legacy):**
```bash
codebox spawn --connect
```

## Tech Stack

- **codebox-orchestrator**: Python 3.12, FastAPI, SQLAlchemy (async SQLite), Docker SDK, websockets
- **codebox-web-ui**: React 19, TanStack Start/Router, shadcn (radix-mira), TanStack Query, Axios, Tailwind v4
- **codebox-cli**: Python 3.12, Click, websockets, Rich, prompt-toolkit
- **codebox-core**: Python 3.12, FastAPI, LangGraph agent framework

Each Python sub-project has its own `.venv` and `pyproject.toml`. All agent components require `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` env vars.
