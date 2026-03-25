# codebox-cli

CLI client for the Codebox platform. Supports two modes:

1. **Orchestrator mode** — manages tasks via the orchestrator API (recommended)
2. **Direct mode** — spawns and connects to sandbox containers directly (legacy)

## Installation

```bash
uv sync
```

## Orchestrator Mode

Requires a running orchestrator (`codebox-orchestrator`).

```bash
# Create and stream a task
codebox task create --title "My task" --prompt "Write hello world"

# List tasks
codebox task list
codebox task list --status running

# Connect to a running task for interactive follow-up
codebox task connect <task_id>

# Cancel or delete a task
codebox task cancel <task_id>
codebox task delete <task_id>

# Use a custom orchestrator URL
codebox task --url http://myhost:8080 list
```

Set `CODEBOX_ORCHESTRATOR_URL` to change the default orchestrator URL (default: `http://localhost:8080`).

## Direct Mode (Legacy)

Connects directly to sandbox containers without the orchestrator.

```bash
# Spawn a container and connect
codebox spawn --connect

# List running containers
codebox list

# Connect to an existing container
codebox connect <container_name>

# Stop a container
codebox stop <container_name>

# Open a shell
codebox exec <container_name>

# View logs
codebox logs <container_name> -f
```

## Configuration

Environment variables (loaded from `.env` and `.env.local`):

| Variable | Description |
|----------|-------------|
| `CODEBOX_ORCHESTRATOR_URL` | Orchestrator URL (default: `http://localhost:8080`) |
| `CODEBOX_IMAGE` | Docker image for sandboxes (default: `codebox-sandbox:latest`) |
| `OPENROUTER_API_KEY` | API key for LLM |
| `OPENROUTER_MODEL` | Default model |
