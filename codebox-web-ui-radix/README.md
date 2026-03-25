# codebox-web-ui

React frontend for the Codebox platform. Connects to `codebox-orchestrator` for task management and real-time agent event streaming.

## Tech Stack

- React 19 + TypeScript
- TanStack Start / Router (file-based routing with SSR)
- TanStack Query (API state management)
- shadcn/ui (radix-mira style, 60+ components)
- Tailwind CSS v4
- Axios (HTTP client)
- Native WebSocket (real-time events)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — stats, active tasks, recent tasks |
| `/tasks/new` | Create a new task |
| `/tasks/:taskId` | Task detail — real-time event stream, follow-up input |
| `/tasks` | Task history with status filtering |
| `/containers` | Running container management |

## Development

```bash
pnpm install
pnpm dev
```

Runs on http://localhost:3000. Expects the orchestrator at http://localhost:8080.

## Configuration

Create a `.env` file (already provided):

```
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
```

## Build

```bash
pnpm build
pnpm preview
```
