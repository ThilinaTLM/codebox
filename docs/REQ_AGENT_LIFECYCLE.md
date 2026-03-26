# Agent Lifecycle & Status Model Improvements

## 1. Overview

Replace the current single `BoxStatus` enum with a cleaner three-dimensional status model that separates container state, task activity, and agent self-reported feedback. This eliminates the behavioral split between GitHub-triggered and manually created boxes, making all sandboxes follow the same lifecycle.

### Goals

- Separate concerns: container health vs current activity vs agent's own assessment
- Treat GitHub-triggered and manual boxes identically — no more `auto_stop` / `trigger` branching
- Let the agent self-report its exit state via a tool (completed, needs clarification, stuck, etc.)
- Auto-stop idle containers after a configurable timeout to save resources
- Allow users to restart stopped containers and resume the conversation thread seamlessly (enabled by the chat memory improvements in REQ_CHAT_MEMORY_IMPROVEMENTS.md)
- Record shell commands (`!` executions) in the agent's chat memory so the agent has full context of what the user did

### Non-Goals (for initial release)

- Per-box configurable idle timeouts (use a global 1-minute default for now)
- Automatic container scaling / pooling
- Agent report status driving automated workflows (e.g. auto-commenting on GitHub)

### Compatibility Note

This project has no existing production environments or data to preserve. There is no need for backward compatibility, database schema migrations, or deprecation periods. SQLite databases can be deleted and recreated from scratch. The old `BoxStatus` enum, `auto_stop` field, and related branching logic should be replaced outright. Keep things clean.

### Dependencies

- **REQ_CHAT_MEMORY_IMPROVEMENTS.md** — the checkpointer and `box_messages` table are required for container restart + thread resume to work

---

## 2. Current State

### Single `BoxStatus` enum (models.py)

```python
class BoxStatus(str, PyEnum):
    STARTING = "starting"
    RUNNING = "running"
    IDLE = "idle"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    STOPPED = "stopped"
```

### Problems

1. **Mixes two concerns** — `RUNNING` vs `IDLE` is about task activity, while `STARTING` vs `STOPPED` is about the container. `COMPLETED` / `FAILED` are about the agent's outcome. All crammed into one enum.

2. **`auto_stop` creates two behavioral paths:**
   - GitHub boxes (`auto_stop=True`): `done` event → `COMPLETED` (terminal, connection closed)
   - Manual boxes (`auto_stop=False`): `done` event → `IDLE` (wait for more input)

   This means the same event (`done`) has completely different effects depending on how the box was created.

3. **`COMPLETED` is terminal** — once a GitHub box completes, there's no way to send follow-up messages or iterate on the result.

4. **The system guesses success/failure** — `COMPLETED` vs `FAILED` is determined by which event type arrives (`done` vs `error`), not by whether the agent actually accomplished its goal.

---

## 3. New Status Model

### 3.1 Container Status (system-managed)

Reflects whether the sandbox container is up. The orchestrator determines this by observing the container service (Docker/Podman) and the gRPC connection state.

```python
class ContainerStatus(str, PyEnum):
    STARTING = "starting"     # Container being created, not yet connected
    RUNNING = "running"       # Container up and gRPC stream active
    STOPPED = "stopped"       # Container shut down (any reason)
```

**Transitions:**
```
STARTING → RUNNING    (container connects via gRPC)
RUNNING  → STOPPED    (idle timeout, user stop, container crash, error)
STOPPED  → STARTING   (user requests restart)
```

No terminal states — a stopped container can always be restarted.

**Stop reason** is stored as a separate field (not a status value):

| `stop_reason` | Meaning |
|---|---|
| `idle_timeout` | Idle monitor triggered shutdown |
| `user_stopped` | User explicitly stopped the box |
| `container_error` | Container crashed or failed to start |
| `orchestrator_shutdown` | Orchestrator shutting down gracefully |
| *(null)* | Container hasn't stopped yet |

### 3.2 Task Status (system-managed)

Reflects what the sandbox is currently doing. Managed by the container itself and reported to the orchestrator via events.

```python
class TaskStatus(str, PyEnum):
    IDLE = "idle"                  # Nothing running, awaiting input
    AGENT_WORKING = "agent_working"  # LLM generating / calling tools
    EXEC_SHELL = "exec_shell"      # User-initiated shell command running
```

**Transitions:**
```
IDLE           → AGENT_WORKING   (user sends message / initial_prompt delivered)
IDLE           → EXEC_SHELL      (user runs ! command)
AGENT_WORKING  → IDLE            (agent stream finishes — done or error)
EXEC_SHELL     → IDLE            (shell command completes)
AGENT_WORKING  → EXEC_SHELL      (not allowed — must go through IDLE)
EXEC_SHELL     → AGENT_WORKING   (not allowed — must go through IDLE)
```

Task status is only meaningful when `container_status = RUNNING`. When the container stops, task status should be set to `IDLE`.

### 3.3 Agent Report Status (agent-managed via tool)

The agent's self-assessment of where things stand. Set by the agent calling a `set_status` tool. This is persisted on the box and survives container stop/restart.

```python
class AgentReportStatus(str, PyEnum):
    IN_PROGRESS = "in_progress"              # Work started but not finished
    COMPLETED = "completed"                  # Agent believes the task is done
    NEED_CLARIFICATION = "need_clarification"  # Agent needs user input
    UNABLE_TO_PROCEED = "unable_to_proceed"  # Agent is stuck / blocked
    NOT_ENOUGH_CONTEXT = "not_enough_context"  # Agent needs more information
```

Nullable — `None` means the agent hasn't set a status yet.

**The `set_status` tool:**

A new tool available to the agent inside the sandbox:

```python
def set_status(status: str, message: str | None = None) -> str:
    """Set the agent's feedback status.

    Args:
        status: One of: completed, in_progress, need_clarification,
                unable_to_proceed, not_enough_context
        message: Optional explanation (e.g. "PR opened at ...",
                 "Need access to the database credentials")
    """
```

- The tool call and its arguments are part of the chat thread (visible in message history)
- The status is sent to the orchestrator via a `report_status` event
- The orchestrator persists it on the box record (`agent_report_status`, `agent_report_message`)
- The web UI can display this prominently (e.g. banner: "Agent needs clarification: ...")

---

## 4. Idle Timeout & Container Auto-Stop

### 4.1 Idle Monitor (in container)

A background asyncio task in the container that monitors task status:

```
every 10 seconds:
    if task_status == IDLE and (now - last_activity) > idle_timeout:
        initiate graceful shutdown
```

- `idle_timeout` defaults to **60 seconds**, configurable via `CODEBOX_IDLE_TIMEOUT` env var
- `last_activity` is updated whenever:
  - A user message is received
  - A shell command is received
  - An agent stream starts
- **Graceful shutdown**: the idle monitor sends a `shutting_down` event to the orchestrator, then exits the process. The container stops naturally.

### 4.2 Orchestrator Fallback

The orchestrator does not need its own timer. It can observe container health directly from the container service (Docker/Podman). If the gRPC stream drops unexpectedly (container crash, network issue), the orchestrator:

1. Checks container status via Docker API
2. If container is dead → set `container_status = STOPPED`, `stop_reason = container_error`
3. If container is alive but not connecting → wait briefly, then mark as stopped

### 4.3 Restart Flow

When a user requests restart on a stopped box:

1. Orchestrator sets `container_status = STARTING`
2. Spawns a new container with the same configuration (model, system prompt, env vars, workspace volume)
3. Container connects via gRPC
4. Orchestrator sends `ThreadRestore` with message history from `box_messages`
5. Container seeds checkpointer, sets `container_status = RUNNING`, `task_status = IDLE`
6. User can now send messages or shell commands to continue

---

## 5. Shell Commands in Chat Memory

User-initiated shell commands (`!` prefix) should be recorded in the agent's chat memory so the agent has full context.

### Message format

When a user runs `! npm test`, this is stored as a message in the thread:

```jsonc
// User's shell command (stored as a user message with metadata)
{
  "role": "user",
  "content": "! npm test",
  "metadata": {"type": "shell_command"}
}

// Shell output (stored as a system/tool message)
{
  "role": "system",
  "content": "Exit code: 1\n\nFAILED: test/auth.test.ts ...",
  "metadata": {"type": "shell_output", "exit_code": 1}
}
```

These are persisted to both:
- The LangGraph checkpointer (so the agent sees them in context)
- The orchestrator's `box_messages` table (so the web UI can render them)

When the agent next runs, its message history includes the shell commands and outputs, giving it full awareness of what the user did between agent turns.

See REQ_CHAT_MEMORY_IMPROVEMENTS.md § Section 3.4 for the full implementation details of how shell commands are persisted to the checkpointer, emitted as `message_complete` events, and stored in the `box_messages` table.

---

## 6. Database Schema Changes

### 6.1 `boxes` table — modified columns

**Remove:**
- `status` (single enum) — replaced by `container_status` + `task_status`
- `auto_stop` — no longer needed, all boxes use idle timeout
- `result_summary` — replaced by `agent_report_message`
- `error_message` — replaced by `agent_report_message` + `stop_reason`

**Add:**
- `container_status` — enum: `starting`, `running`, `stopped`
- `task_status` — enum: `idle`, `agent_working`, `exec_shell`
- `stop_reason` — nullable string: `idle_timeout`, `user_stopped`, `container_error`, `orchestrator_shutdown`
- `agent_report_status` — nullable enum: `completed`, `in_progress`, `need_clarification`, `unable_to_proceed`, `not_enough_context`
- `agent_report_message` — nullable text (agent's explanation)
- `idle_timeout` — integer, seconds, default 60

**Keep unchanged:**
- `trigger` — still useful as metadata (how was this box created), but no longer drives behavior
- `initial_prompt`, `system_prompt` — unchanged
- All GitHub fields — unchanged
- All container/session fields — unchanged

### 6.2 Existing `FeedbackRequest` table

The current `FeedbackRequest` model (human-in-the-loop questions) is a separate concept from `AgentReportStatus`. `FeedbackRequest` is for the agent asking a specific question mid-task. `AgentReportStatus` is the agent's overall self-reported assessment of its progress. Both can coexist.

---

## 7. Event Changes

### New events (sandbox → orchestrator)

| Event | Trigger | Data |
|---|---|---|
| `task_status_changed` | Task transitions (idle→working, working→idle, etc.) | `{"status": "agent_working"}` |
| `report_status` | Agent calls `set_status` tool | `{"status": "completed", "message": "PR opened"}` |
| `shutting_down` | Idle monitor triggers | `{"reason": "idle_timeout"}` |

### Modified events

| Event | Change |
|---|---|
| `done` | No longer triggers status transitions in orchestrator. Just indicates the agent stream finished. Task status → `IDLE` is handled via `task_status_changed`. |
| `error` | Same — no longer sets box to `FAILED`. Just logged. Agent can set `unable_to_proceed` via tool if appropriate. |

---

## 8. Affected Files

### codebox-core

| File | Change |
|---|---|
| `src/codebox_daemon/agent.py` | Register `set_status` tool with the agent |
| `src/codebox_daemon/agent_runner.py` | Emit `task_status_changed` events on stream start/end |
| `src/codebox_daemon/callback.py` | Handle shell commands in chat memory, add idle monitor task |
| `src/codebox_daemon/sessions.py` | Track `last_activity` timestamp, `idle_timeout` config |

### codebox-orchestrator

| File | Change |
|---|---|
| `src/codebox_orchestrator/db/models.py` | Replace `BoxStatus` with `ContainerStatus` + `TaskStatus` + `AgentReportStatus`; update `Box` columns |
| `src/codebox_orchestrator/schemas.py` | Update schemas to reflect new status fields |
| `src/codebox_orchestrator/services/box_service.py` | Remove `auto_stop` logic; add restart flow; update status management |
| `src/codebox_orchestrator/routes/ws_callback.py` | Remove `auto_stop` branching; handle new event types |
| `src/codebox_orchestrator/routes/api.py` | Update endpoints to expose new status fields; add restart endpoint |
| `src/codebox_orchestrator/services/github_service.py` | Remove `auto_stop=True`; boxes created same as manual |

### codebox-web-ui

| Area | Change |
|---|---|
| Box status display | Show container status + task status + feedback status separately |
| Box detail page | Show agent feedback prominently (banner/badge) |
| Box actions | Add "Restart" button for stopped containers |
| Chat view | Render shell commands and outputs inline in the thread |

---

## 9. Implementation Notes

No database schema migration is needed — this is a greenfield project. SQLite databases will be deleted and recreated from the new schema. Replace the old `BoxStatus` enum and `auto_stop` logic directly.

Implement alongside the gRPC migration (Phase 2 of REQ_CHAT_MEMORY_IMPROVEMENTS.md). The new event types (`task_status_changed`, `report_status`, `shutting_down`) should be defined in the protobuf schema from the start.
