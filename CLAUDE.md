# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monorepo for a sandboxed AI coding agent platform. Four sub-projects:

- **codebox-core** — FastAPI daemon (REST + WebSocket API) for AI agent sessions
- **codebox-cli** — CLI client that manages Docker containers and connects to the daemon
- **codebox-docker** — Dockerfile packaging codebox-core with Devbox toolchains into a container
- **demo-deepagents** — Standalone terminal demo, same agent framework without Docker

## How They Fit Together

The CLI spawns a Docker container (built from codebox-docker, which embeds codebox-core). It retrieves an auth token from the container, creates a session via REST, then streams agent events over WebSocket. demo-deepagents is independent — it runs the same DeepAgents agent locally without the daemon layer.

Each sub-project has its own `.venv` and `pyproject.toml`. Python 3.12. All agent components require `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` env vars.
