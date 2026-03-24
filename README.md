# Open Coding Agents

A sandboxed AI coding agent platform. Run AI-powered coding sessions inside isolated Docker containers with a streaming WebSocket API.

## Sub-projects

| Directory | Description |
|---|---|
| **codebox-core** | FastAPI daemon exposing REST + WebSocket API for agent sessions |
| **codebox-cli** | CLI client that manages Docker containers and connects to the daemon |
| **codebox-docker** | Dockerfile packaging codebox-core with Devbox toolchains |
| **demo-deepagents** | Standalone terminal demo — same agent framework without Docker |

## How It Works

The CLI spawns a Docker container (built from codebox-docker, which embeds codebox-core). It retrieves an auth token, creates a session via REST, then streams agent events over WebSocket. demo-deepagents runs the same agent locally without the daemon layer.

## Requirements

- Python 3.12
- Docker
- Environment variables: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`

Each sub-project has its own `.venv` and `pyproject.toml`.

## Getting Started

```bash
# Build the Docker image
cd codebox-docker && docker build -t codebox .

# Run via CLI
cd codebox-cli && pip install -e . && codebox run
```
