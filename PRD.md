# Product Requirements Document (PRD)

## Codebox — AI Coding Agent Platform

**Version:** 1.0
**Date:** 2026-03-27
**Author:** Codebox Team

---

## 1. Executive Summary

Codebox is a web-based platform for running AI coding agents in sandboxed Docker containers. Users create "Boxes" — each a container with an AI model — and interact via real-time chat. The agent can read/write files, run shell commands, search the web, and report its own progress. The platform also integrates with GitHub to automatically spawn agents from issue and PR comments.

The web UI is the primary interface. It needs to support creating agents, monitoring their work in real-time, browsing their output files, managing containers, and configuring GitHub integrations.

---

## 2. Target Users

| Persona | Description |
|---------|-------------|
| **Developer** | Software engineer who creates agents to solve coding tasks, fix bugs, or build features. Primary user. Monitors agent progress, reviews output, provides follow-up instructions. |
| **Team Lead** | Manages multiple agents across a team. Needs overview of all running boxes, their statuses, and resource usage. |
| **GitHub User** | Interacts with agents via GitHub issue/PR comments. May visit the web UI to monitor agent progress or provide feedback. |

---

## 3. Product Goals

1. **Transparency** — Users must see exactly what the agent is doing in real-time (LLM reasoning, tool calls, shell commands, file changes)
2. **Control** — Users can send messages, run shell commands, cancel operations, stop/restart containers at any time
3. **Efficiency** — Quick box creation, fast navigation between boxes, minimal clicks for common actions
4. **Scale** — Dashboard supports monitoring dozens of concurrent agents
5. **Integration** — Seamless GitHub workflow (issue → agent → PR)

---

## 4. Domain Model

### 4.1 Box (Central Entity)

A **Box** is a sandboxed Docker container running an AI coding agent. It is the core unit users interact with.

**Identity:**
- `id` (UUID)
- `name` (user-provided or auto-generated)
- `model` (LLM model identifier, e.g. "anthropic/claude-sonnet-4-20250514")

**Configuration:**
- `system_prompt` (optional custom instructions for the agent)
- `initial_prompt` (optional message auto-sent on container start; if null, box starts idle)
- `idle_timeout` (seconds before auto-stop when idle, default 60)

**Three-Dimensional Status Model:**

| Dimension | Values | Managed By | Description |
|-----------|--------|------------|-------------|
| `container_status` | `starting`, `running`, `stopped` | System | Docker container lifecycle |
| `task_status` | `idle`, `agent_working`, `exec_shell` | System | What the agent is currently doing |
| `agent_report_status` | `completed`, `in_progress`, `need_clarification`, `unable_to_proceed`, `not_enough_context` | Agent | Agent's self-assessment of task progress |

- `agent_report_message` — Free-text explanation from the agent (e.g., "PR opened at https://...")
- `stop_reason` (nullable) — Why the container stopped: `idle_timeout`, `user_stopped`, `container_error`, `orchestrator_shutdown`

**GitHub Metadata (nullable):**
- `trigger` — `"github_issue"`, `"github_pr"`, or `null` (manual)
- `github_repo`, `github_issue_number`, `github_pr_number`

**Timestamps:**
- `created_at`, `started_at`, `completed_at`

### 4.2 Box Events (Real-time Stream)

Events are the core of the agent interaction experience. They stream in real-time via WebSocket.

| Event Type | Description | UI Treatment |
|------------|-------------|--------------|
| `token` | Streaming LLM text token | Append to current message (typewriter effect) |
| `model_start` | LLM started processing | Show thinking/loading indicator |
| `tool_start` | Agent invoked a tool | Show tool name + input args (collapsible) |
| `tool_end` | Tool returned result | Show output under tool call (collapsible) |
| `exec_output` | Shell command output (streaming) | Append to terminal-like output block |
| `exec_done` | Shell command completed | Show exit code, mark block complete |
| `done` | Agent finished responding | Mark turn complete |
| `error` | Error occurred | Show error message prominently |
| `status_change` | Box status changed | Update status indicators |
| `report_status` | Agent reported its task status | Show status badge + message |
| `message_complete` | Full structured message | Used for history replay on reconnect |

### 4.3 User Actions on a Box

| Action | Description |
|--------|-------------|
| **Send message** | Text message to the agent (chat input) |
| **Run shell command** | Execute command in container (prefix `!` in input) |
| **Cancel** | Abort the current agent operation |
| **Stop** | Stop the container (preserves history) |
| **Restart** | Restart a stopped container (restores chat thread) |
| **Delete** | Permanently remove box + container |
| **Browse files** | Navigate the container's filesystem |
| **Read file** | View file contents with syntax highlighting |
| **Download file** | Download a file from the container |

### 4.4 GitHub Integration

- **GitHub App** installed on user's org/repos
- **Webhook-triggered boxes**: Mentioning the bot in an issue or PR comment creates a box automatically
- **Installations**: Users manage which GitHub installations are connected
- **Repos**: Each installation exposes a list of repos the app has access to

---

## 5. Information Architecture

### 5.1 Pages

```
/                           — Dashboard (box list)
/boxes/:boxId               — Box workspace (chat + files)
/containers                 — Container management
/containers/:containerId/logs — Container logs
/settings                   — App settings
/settings/github            — GitHub integration settings
```

### 5.2 Navigation

- **Top bar** — Persistent navigation: Brand, Agents, Containers, Settings, New Agent button
- **Box detail** — Context-aware top bar: Back button, box name, status, actions (stop/delete/restart)

---

## 6. Functional Requirements

### 6.1 Dashboard (`/`)

**Purpose:** Overview of all boxes. Primary landing page.

**Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| D-1 | Display all boxes grouped by status: Active (running/starting) and Recent (stopped) | Must |
| D-2 | Each box card shows: name, model, status badge, created/started timestamp | Must |
| D-3 | Box cards show GitHub metadata when present (repo name, issue/PR number as link) | Must |
| D-4 | "New Agent" button to create a box (opens creation flow) | Must |
| D-5 | Quick actions on cards: Stop (for running), Delete | Must |
| D-6 | Real-time updates: new boxes appear, status changes reflected without refresh | Must |
| D-7 | Empty state when no boxes exist with call-to-action | Must |
| D-8 | Filter/sort boxes (by status, creation date, trigger type) | Should |
| D-9 | Search boxes by name | Should |
| D-10 | Bulk actions (stop all, delete stopped) | Could |

**Box Creation Flow:**

| ID | Requirement | Priority |
|----|-------------|----------|
| C-1 | Provide box name (optional, auto-generated if blank) | Must |
| C-2 | Select LLM model from available models | Should |
| C-3 | Enter initial prompt (the task for the agent) | Must |
| C-4 | Set custom system prompt (advanced, optional) | Could |
| C-5 | Set idle timeout (advanced, optional, default 60s) | Could |
| C-6 | After creation, navigate to box workspace | Must |

### 6.2 Box Workspace (`/boxes/:boxId`)

**Purpose:** Primary interaction surface. Where users chat with the agent, observe its work, and browse its files.

This is the most important page in the application.

**Layout:** Split-panel workspace:
- **Left panel** (collapsible): File explorer
- **Main panel**: Event stream (chat + agent activity) with input bar at bottom

#### 6.2.1 Event Stream

| ID | Requirement | Priority |
|----|-------------|----------|
| E-1 | Display real-time streaming events from the agent | Must |
| E-2 | **Text messages**: Render markdown with syntax highlighting for code blocks | Must |
| E-3 | **Thinking/reasoning**: Show animated indicator while agent is thinking | Must |
| E-4 | **Tool calls**: Show tool name, collapsible input args, collapsible output | Must |
| E-5 | **Shell execution**: Terminal-like block with command, streaming output, exit code | Must |
| E-6 | **User messages**: Visually distinct (right-aligned or different background) | Must |
| E-7 | **Errors**: Prominent red error display | Must |
| E-8 | **Status changes**: Inline dividers showing status transitions | Must |
| E-9 | **Agent report**: Banner or badge showing agent's self-reported status + message | Must |
| E-10 | Auto-scroll to latest event (with ability to scroll up without jumping back) | Must |
| E-11 | On reconnect/page load: replay persisted event history | Must |
| E-12 | Empty state: "Waiting for events..." when no activity yet | Must |
| E-13 | Timestamps on events (hoverable or inline) | Should |
| E-14 | Copy button on code blocks and tool outputs | Should |
| E-15 | Collapse/expand long tool outputs | Should |

#### 6.2.2 Input Bar

| ID | Requirement | Priority |
|----|-------------|----------|
| I-1 | Multi-line text input (auto-expanding, max height) | Must |
| I-2 | Send button (or Enter key; Shift+Enter for newline) | Must |
| I-3 | Shell mode: prefix `!` to execute as shell command | Must |
| I-4 | Visual indicator when in shell mode (badge or color change) | Must |
| I-5 | Cancel button visible while agent is working | Must |
| I-6 | Disabled state when container is stopped (show restart prompt instead) | Must |
| I-7 | Input history (up/down arrow to recall previous messages) | Could |

#### 6.2.3 File Explorer

| ID | Requirement | Priority |
|----|-------------|----------|
| F-1 | Hierarchical tree view of container's `/workspace` directory | Must |
| F-2 | Lazy-load directory contents on expand (don't fetch entire tree upfront) | Must |
| F-3 | Click file to view contents | Must |
| F-4 | Syntax highlighting based on file extension | Must |
| F-5 | Binary file detection with appropriate handling (preview for images, download for others) | Must |
| F-6 | Download button for files | Must |
| F-7 | Refresh button to reload tree | Must |
| F-8 | File size display | Should |
| F-9 | Collapsible panel (toggle via top bar button) | Must |
| F-10 | Resizable panel width (drag handle) | Should |
| F-11 | Search/filter files in tree | Could |

#### 6.2.4 Box Header/Status

| ID | Requirement | Priority |
|----|-------------|----------|
| H-1 | Show box name (editable would be nice) | Must |
| H-2 | Show all three status dimensions clearly (container, task, agent report) | Must |
| H-3 | Show model name | Must |
| H-4 | Stop button (with confirmation) | Must |
| H-5 | Delete button (with confirmation) | Must |
| H-6 | Restart button (when stopped) | Must |
| H-7 | Back to dashboard navigation | Must |
| H-8 | Show GitHub context (repo, issue/PR link) when applicable | Should |

### 6.3 Container Management (`/containers`)

**Purpose:** Low-level Docker container management for debugging and administration.

| ID | Requirement | Priority |
|----|-------------|----------|
| CN-1 | Table of all Docker containers with: ID, Name, Image, Status, Uptime | Must |
| CN-2 | Status badge with visual indicator (running = green pulse, stopped = gray) | Must |
| CN-3 | Actions per container: View Logs, Start, Stop, Delete | Must |
| CN-4 | Confirmation dialogs for destructive actions | Must |
| CN-5 | Auto-refresh or real-time container status updates | Should |

### 6.4 Container Logs (`/containers/:containerId/logs`)

| ID | Requirement | Priority |
|----|-------------|----------|
| CL-1 | Display container logs (last 200 lines by default) | Must |
| CL-2 | Auto-scroll to bottom | Must |
| CL-3 | Monospace font, terminal-like appearance | Must |
| CL-4 | Refresh / follow mode | Should |

### 6.5 Settings (`/settings`)

| ID | Requirement | Priority |
|----|-------------|----------|
| S-1 | Theme toggle (light/dark) | Must |
| S-2 | Link to GitHub integration settings | Must |
| S-3 | Default model selection | Could |
| S-4 | Default idle timeout | Could |

### 6.6 GitHub Integration (`/settings/github`)

| ID | Requirement | Priority |
|----|-------------|----------|
| G-1 | Show GitHub App connection status (enabled/disabled, app name) | Must |
| G-2 | "Install GitHub App" button (redirects to GitHub OAuth flow) | Must |
| G-3 | List connected installations with account name and type | Must |
| G-4 | Per-installation: show synced repos with private/public badges | Must |
| G-5 | "Sync Repos" action per installation | Must |
| G-6 | "Remove" action per installation (with confirmation) | Must |
| G-7 | Manual installation setup (enter installation ID) | Should |

---

## 7. Real-time Behavior

The application is real-time-first. Two WebSocket connections maintain live state:

### 7.1 Global WebSocket (`/api/ws`)

Always connected. Receives platform-level events:
- `box_created` — New box appears in dashboard
- `box_status_changed` — Status updates across all boxes
- `box_deleted` — Box removed from dashboard
- `ping` — Keepalive

**UI Impact:** Dashboard and any box-related UI updates without polling or refresh.

### 7.2 Per-Box WebSocket (`/api/boxes/:boxId/ws`)

Connected when viewing a box workspace. Receives agent activity:
- Streaming LLM tokens, tool calls, shell output
- Status changes, errors, completion events
- On connect: replays persisted event history first, then live events

**Client can send:**
- `{"type": "message", "content": "..."}` — Chat message
- `{"type": "exec", "content": "..."}` — Shell command
- `{"type": "cancel"}` — Cancel operation

**Reconnection:** Auto-reconnect with exponential backoff (max 30s).

---

## 8. API Surface (Reference)

### 8.1 REST Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/boxes` | Create box |
| `GET` | `/api/boxes` | List boxes (filterable by status, trigger) |
| `GET` | `/api/boxes/:id` | Get box details |
| `DELETE` | `/api/boxes/:id` | Delete box |
| `POST` | `/api/boxes/:id/stop` | Stop box |
| `POST` | `/api/boxes/:id/restart` | Restart stopped box |
| `POST` | `/api/boxes/:id/cancel` | Cancel current operation |
| `POST` | `/api/boxes/:id/message` | Send message (REST fallback) |
| `GET` | `/api/boxes/:id/events` | Get persisted events |
| `GET` | `/api/boxes/:id/messages` | Get structured message thread |
| `GET` | `/api/boxes/:id/files?path=` | List directory contents |
| `GET` | `/api/boxes/:id/files/read?path=` | Read file |
| `GET` | `/api/containers` | List containers |
| `GET` | `/api/containers/:id/logs` | Get container logs |
| `POST` | `/api/containers/:id/start` | Start container |
| `POST` | `/api/containers/:id/stop` | Stop container |
| `DELETE` | `/api/containers/:id` | Delete container |
| `GET` | `/api/github/status` | GitHub integration status |
| `GET` | `/api/github/installations` | List installations |
| `POST` | `/api/github/installations` | Add installation |
| `POST` | `/api/github/installations/:id/sync` | Sync repos |
| `DELETE` | `/api/github/installations/:id` | Remove installation |
| `GET` | `/api/github/repos` | List all repos |

### 8.2 Key Data Shapes

**BoxResponse:**
```json
{
  "id": "uuid",
  "name": "Fix auth bug",
  "model": "anthropic/claude-sonnet-4-20250514",
  "container_status": "running",
  "task_status": "agent_working",
  "agent_report_status": "in_progress",
  "agent_report_message": "Investigating the issue...",
  "stop_reason": null,
  "idle_timeout": 60,
  "system_prompt": null,
  "initial_prompt": "Fix the authentication bug in login.py",
  "container_id": "abc123",
  "session_id": "sess_xyz",
  "workspace_path": "/workspace",
  "trigger": "github_issue",
  "github_repo": "acme/webapp",
  "github_issue_number": 42,
  "github_pr_number": null,
  "created_at": "2026-03-27T10:00:00Z",
  "started_at": "2026-03-27T10:00:05Z",
  "completed_at": null
}
```

**WebSocket Event Examples:**
```json
{"type": "token", "text": "I'll start by"}
{"type": "tool_start", "name": "read", "tool_call_id": "tc_1", "input": "{\"path\": \"login.py\"}"}
{"type": "tool_end", "name": "read", "output": "def login(user, pw): ..."}
{"type": "exec_output", "output": "pytest: 3 passed, 1 failed\n", "request_id": "req_1"}
{"type": "exec_done", "output": "1", "request_id": "req_1"}
{"type": "status_change", "task_status": "idle"}
{"type": "report_status", "status": "completed", "message": "Fixed the bug and all tests pass"}
{"type": "done", "content": "I've fixed the authentication bug..."}
```

---

## 9. Agent Capabilities (What the Agent Can Do)

The AI agent inside each box has access to these tools. The UI should be designed to clearly display their usage:

| Tool | Description | UI Display |
|------|-------------|------------|
| `read` | Read file contents | Show file path, collapsible content |
| `write` | Create/overwrite files | Show file path, collapsible content diff |
| `edit` | Edit specific lines in files | Show file path, line range, changes |
| `ls_info` | List directory | Show directory path, file listing |
| `grep_raw` | Search files by pattern | Show pattern, matching files/lines |
| `glob_info` | Find files by glob pattern | Show pattern, matching files |
| `execute` | Run shell commands | Terminal block with command + output |
| `web_search` | Search the web | Show query, collapsible results |
| `web_fetch` | Fetch a URL | Show URL, collapsible content |
| `set_status` | Report task progress | Update status badge/banner |

---

## 10. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Event stream must render at LLM token speed (~100 tokens/sec) without lag |
| **Responsiveness** | UI must work on desktop (1024px+); mobile is not a priority but basic usability is nice |
| **Accessibility** | Keyboard navigation for primary flows; proper ARIA labels; sufficient contrast |
| **Theme** | Dark mode (default) and light mode |
| **Latency** | Box creation to first event: under 30 seconds (container startup time) |
| **Concurrent boxes** | Dashboard should handle 50+ boxes without performance degradation |
| **Reconnection** | WebSocket auto-reconnects with backoff; no data loss on temporary disconnection |

---

## 11. Current Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | React 19 + TanStack Start (SSR) + TanStack Router (file-based routing) |
| **Data fetching** | TanStack Query (REST) + WebSocket (real-time) |
| **HTTP client** | Axios |
| **Styling** | Tailwind CSS v4 (OKLCH color system) |
| **Components** | shadcn/ui (Base UI / Radix primitives) |
| **Theme** | next-themes (dark/light) |
| **Fonts** | Geist (sans) + Geist Mono (monospace) |
| **Markdown** | react-markdown + remark-gfm |
| **Layout** | react-resizable-panels |

---

## 12. Design Considerations

### 12.1 Visual Identity

- The platform manages AI coding agents — the aesthetic should feel **technical, professional, and developer-oriented**
- Think: IDE meets dashboard. Not consumer SaaS.
- Current primary color: warm orange (`oklch(0.617 0.137 39°)`)
- Dark mode is the default and primary experience

### 12.2 Key UX Challenges

1. **Event stream density**: Agents produce a lot of output (tokens, tool calls, shell commands). The UI needs to balance showing everything transparently vs. not overwhelming the user. Collapsible sections, visual hierarchy, and smart grouping are essential.

2. **Three-dimensional status**: Container status, task status, and agent report status all need to be visible simultaneously without confusion. Need a clear visual language for each dimension.

3. **Long-running tasks**: Agents may work for minutes to hours. The UI should make it easy to check in, understand progress at a glance, and go back to work.

4. **Multiple concurrent agents**: Users may run many agents simultaneously. Dashboard needs to surface which ones need attention (errors, clarification requests) vs. which are working fine.

5. **GitHub context**: Some boxes are triggered by GitHub events. The connection between the box and its GitHub issue/PR should be visually clear and navigable.

6. **Shell vs. chat mode**: Users can send chat messages or shell commands from the same input. The mode distinction needs to be clear to avoid accidents.

### 12.3 Inspiration / Comparable Products

- **GitHub Codespaces** — Container-based dev environments
- **Cursor / Windsurf** — AI coding assistants with tool use visibility
- **Vercel** — Dashboard for managing deployments (status management pattern)
- **Linear** — Clean, fast, keyboard-driven project management
- **Railway** — Container management with logs and real-time status

---

## 13. Out of Scope (v1)

- Mobile-native experience
- Multi-user / team collaboration (auth, permissions)
- Billing / usage tracking
- Custom tool definitions via UI
- Agent-to-agent communication
- File editing within the web UI (read-only file viewer is in scope)
- Video/audio interaction with agents

---

## 14. Glossary

| Term | Definition |
|------|------------|
| **Box** | A container + AI agent unit. The central entity users interact with. |
| **Agent** | The AI model running inside a box that performs coding tasks. |
| **Container** | Docker container providing the sandboxed execution environment. |
| **Event** | A discrete unit of agent activity (token, tool call, shell output, etc.) |
| **Tool** | A capability the agent can invoke (file read, shell execute, web search, etc.) |
| **Agent Report Status** | The agent's self-assessment of task progress (completed, in_progress, etc.) |
| **Initial Prompt** | The task description sent to the agent when the box starts. |
| **Idle Timeout** | How long a box stays running with no activity before auto-stopping. |
| **Trigger** | What caused the box to be created (manual, github_issue, github_pr). |
