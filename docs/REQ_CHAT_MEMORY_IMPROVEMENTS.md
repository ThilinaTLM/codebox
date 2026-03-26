# Chat Memory & Sandbox Communication Improvements

## 1. Overview

Replace the current fragile, in-memory chat history in codebox-core with LangGraph's built-in checkpointing, and migrate the sandbox↔orchestrator transport from WebSocket to gRPC bidirectional streaming. Together these changes enable durable agent threads (stop/restart/resume), mid-conversation user interrupts, and a richer chat UI backed by structured message history.

### Goals

- Persist full agent thread state (system prompts, user messages, AI responses, tool calls, tool results, shell commands and their output) so a box can be stopped and resumed
- Allow users to interrupt a running agent at any time and inject additional prompts
- Provide the orchestrator with structured, ordered message history (not just streaming tokens) so the web UI can render a complete, interactive chat view
- Replace the untyped WebSocket protocol between sandbox and orchestrator with gRPC for type safety, backpressure, and reliability
- Keep the orchestrator decoupled from container storage — no volume mounts or Docker-specific coupling

### Non-Goals (for initial release)

- Migrating the orchestrator↔web-ui connection (stays WebSocket/REST)
- Cross-box conversation threading (each box has one thread)
- Message editing or branching within a thread
- Migrating the orchestrator database from SQLite to Postgres

### Compatibility Note

This project has no existing production environments or data to preserve. There is no need for backward compatibility, database schema migrations, or deprecation periods. SQLite databases can be deleted and recreated from scratch. Old code (e.g. the WebSocket callback path) should be replaced outright, not maintained in parallel. Keep things clean.

---

## 2. Architecture

### Current State

```
[sandbox container]                          [orchestrator]
  Session.messages (in-memory list)            box_events table (flat streaming events)
       │                                            ▲
       └──── WebSocket (untyped JSON) ──────────────┘
```

Problems:
- Container restart = thread lost (in-memory only)
- `box_events` stores presentation events (`token`, `tool_start`) — cannot reconstruct an LLM thread
- WebSocket protocol is implicit — event types scattered across `callback.py` and `ws_callback.py` as string matching
- No delivery guarantees, no backpressure, no typed contracts

### Target State

```
[sandbox container]                          [orchestrator]                    [web-ui]
  LangGraph checkpointer                       box_messages table               REST + WS
  (SQLite, local to container)                 (structured thread)
       │                                            ▲                              │
       └──── gRPC bidi stream ──────────────────────┘                              │
                                                    └───── REST + WebSocket ───────┘
```

---

## 3. Chat Memory: LangGraph Checkpointer

### 3.1 Add a Checkpointer in codebox-core

Use `langgraph.checkpoint.sqlite.aio.AsyncSqliteSaver` with a local SQLite database inside the container (e.g. `/workspace/.codebox/checkpoints.db`).

Pass the checkpointer to `create_deep_agent()` which already accepts a `checkpointer` parameter.

**Changes:**
- `codebox-core/src/codebox_daemon/agent.py` — instantiate `AsyncSqliteSaver`, pass to `create_deep_agent()`
- `codebox-core/src/codebox_daemon/sessions.py` — remove `messages: list[dict]` from `Session`; the checkpointer is the source of truth

### 3.2 Thread-aware Agent Invocation

When invoking the agent, pass a `thread_id` in the config and only send the **new** message as input (not the full history):

```python
config = {
    "configurable": {"thread_id": session_id},
    "recursion_limit": session.recursion_limit,
}
await session.agent.astream_events(
    {"messages": [HumanMessage(content=new_message)]},
    version="v2",
    config=config,
)
```

LangGraph loads prior state from the checkpoint automatically.

**Changes:**
- `codebox-core/src/codebox_daemon/agent_runner.py` — stop passing `session.messages`, pass `thread_id` config, send only the latest message

### 3.3 Emit `message_complete` Events

After each LangGraph node completes, emit a structured `message_complete` event to the orchestrator containing the full message object (role, content, tool_calls, tool_call_id, etc.). This is in addition to the existing streaming events (`token`, `tool_start`, `tool_end`) which continue to power the real-time UI.

Example events:

```jsonc
// AI response with tool calls
{
  "type": "message_complete",
  "message": {
    "role": "assistant",
    "content": "Let me check that file...",
    "tool_calls": [
      {"id": "tc_1", "name": "read_file", "args": {"path": "/workspace/main.py"}}
    ]
  }
}

// Tool result
{
  "type": "message_complete",
  "message": {
    "role": "tool",
    "tool_call_id": "tc_1",
    "name": "read_file",
    "content": "def main(): ..."
  }
}
```

**Changes:**
- `codebox-core/src/codebox_daemon/agent_runner.py` — hook into agent node completions to emit `message_complete`

### 3.4 Shell Commands in Chat Memory

User-initiated shell commands (via `!` prefix in the chat UI or CLI) must be recorded in the agent's chat thread. This is critical so the agent has full context of what the user did between agent turns — e.g. if the user ran `! npm test` and saw failures, the agent should know that when it next responds.

Both the shell command and its output are stored as messages in the thread:

```jsonc
// User's shell command
{
  "type": "message_complete",
  "message": {
    "role": "user",
    "content": "! npm test",
    "metadata": {"type": "shell_command"}
  }
}

// Shell output
{
  "type": "message_complete",
  "message": {
    "role": "system",
    "content": "Exit code: 1\n\nFAILED: test/auth.test.ts ...",
    "metadata": {"type": "shell_output", "exit_code": 1}
  }
}
```

These are persisted to:
- The LangGraph checkpointer inside the container (so the agent sees them in its message history)
- The orchestrator's `box_messages` table (so the web UI can render them inline in the chat)
- Emitted as `message_complete` events over gRPC (same as agent messages)

This means agent messages, user messages, and shell executions all live in **one unified thread**. The agent, the orchestrator, and the web UI all see the same complete conversation history.

See also: REQ_AGENT_LIFECYCLE.md § Section 5 (Shell Commands in Chat Memory) for how shell commands interact with task status.

**Changes:**
- `codebox-core/src/codebox_daemon/agent_runner.py` — wrap exec commands/output as messages, persist to checkpointer, emit `message_complete`
- `codebox-core/src/codebox_daemon/callback.py` — on `exec` command, record the command and output in the thread

### 3.5 Orchestrator: `box_messages` Table

New table to store the structured thread alongside the existing `box_events` table.

```
box_messages
├── id (UUID, PK)
├── box_id (FK → boxes)
├── seq (integer, auto-increment per box — message ordering)
├── role (enum: system, user, assistant, tool)
├── content (text, nullable)
├── tool_calls (JSON, nullable — for assistant messages with tool calls)
├── tool_call_id (text, nullable — for tool result messages)
├── tool_name (text, nullable — for tool result messages)
├── metadata (JSON, nullable — e.g. {"type": "shell_command"} or {"type": "shell_output", "exit_code": 1})
├── created_at (datetime)
```

**Changes:**
- `codebox-orchestrator/src/codebox_orchestrator/db/models.py` — add `BoxMessage` model
- `codebox-orchestrator/src/codebox_orchestrator/schemas.py` — add `BoxMessageSchema`

### 3.6 Orchestrator: Persist `message_complete` Events

When the orchestrator receives a `message_complete` event via the gRPC stream, write it to `box_messages`. Continue persisting streaming events to `box_events` as before.

Also persist user messages to `box_messages` when they are sent (before forwarding to the container).

**Changes:**
- gRPC callback handler (new, replaces `ws_callback.py`) — persist to `box_messages` on `message_complete`
- Message send logic — persist user messages to `box_messages` before forwarding

### 3.7 Orchestrator: Thread Restore on Container Reconnect

When a container connects (or reconnects) to the orchestrator, the orchestrator sends a `thread_restore` command containing the full ordered message history from `box_messages`. The container uses this to seed the agent's state if the local checkpoint is missing (e.g. fresh container after restart).

**Flow:**
1. Container starts, opens gRPC stream to orchestrator
2. Container sends `Register` event
3. Orchestrator replies with `ThreadRestore` command (may be empty for new boxes)
4. Container seeds checkpointer or passes messages as initial state
5. Normal operation begins

**Changes:**
- gRPC callback handler — send `ThreadRestore` after registration
- `codebox-core/src/codebox_daemon/callback.py` — handle `ThreadRestore`, seed checkpointer

### 3.8 REST Endpoint for Thread History

New endpoint for the web UI to fetch the full structured thread:

```
GET /api/boxes/{box_id}/messages → list[BoxMessageSchema]
```

Returns ordered messages with all fields (role, content, tool_calls, etc.) for rendering a complete chat view.

**Changes:**
- `codebox-orchestrator/src/codebox_orchestrator/routes/api.py` — add endpoint

---

## 4. gRPC: Sandbox ↔ Orchestrator Transport

### 4.1 Protocol Definition

Replace the current untyped WebSocket JSON protocol with a gRPC bidirectional streaming RPC. The sandbox (client) initiates the connection to the orchestrator (server).

```protobuf
syntax = "proto3";
package codebox.sandbox;

service SandboxService {
  // Sandbox opens this on startup. Stays open for the container's lifetime.
  // Sandbox sends events, orchestrator sends commands.
  rpc Connect(stream SandboxEvent) returns (stream OrchestratorCommand);
}

// ──────────────────────────────────────────────
// Sandbox → Orchestrator events
// ──────────────────────────────────────────────

message SandboxEvent {
  oneof event {
    RegisterEvent register = 1;
    TokenEvent token = 2;
    ModelStartEvent model_start = 3;
    ToolStartEvent tool_start = 4;
    ToolEndEvent tool_end = 5;
    MessageCompleteEvent message_complete = 6;
    DoneEvent done = 7;
    ErrorEvent error = 8;
    ExecOutputEvent exec_output = 9;
    ExecDoneEvent exec_done = 10;
    ListFilesResultEvent list_files_result = 11;
    ReadFileResultEvent read_file_result = 12;
  }
}

message RegisterEvent {
  string session_id = 1;
}

message TokenEvent {
  string text = 1;
}

message ModelStartEvent {}

message ToolStartEvent {
  string name = 1;
  string tool_call_id = 2;
  string input = 3;
}

message ToolEndEvent {
  string name = 1;
  string output = 2;
}

message MessageCompleteEvent {
  ChatMessage message = 1;
}

message DoneEvent {
  string content = 1;
}

message ErrorEvent {
  string detail = 1;
}

message ExecOutputEvent {
  string output = 1;
  string request_id = 2;
}

message ExecDoneEvent {
  string output = 1;
  string request_id = 2;
}

message ListFilesResultEvent {
  string request_id = 1;
  string data_json = 2;   // JSON-encoded directory listing
  string error = 3;
}

message ReadFileResultEvent {
  string request_id = 1;
  string data_json = 2;   // JSON-encoded file content
  string error = 3;
}

// ──────────────────────────────────────────────
// Orchestrator → Sandbox commands
// ──────────────────────────────────────────────

message OrchestratorCommand {
  oneof command {
    RegisteredCommand registered = 1;
    SendMessageCommand message = 2;
    ExecCommand exec = 3;
    CancelCommand cancel = 4;
    ThreadRestoreCommand thread_restore = 5;
    ListFilesCommand list_files = 6;
    ReadFileCommand read_file = 7;
  }
}

message RegisteredCommand {}

message SendMessageCommand {
  string content = 1;
}

message ExecCommand {
  string content = 1;
  string request_id = 2;
}

message CancelCommand {}

message ThreadRestoreCommand {
  repeated ChatMessage messages = 1;
}

message ListFilesCommand {
  string path = 1;
  string request_id = 2;
}

message ReadFileCommand {
  string path = 1;
  string request_id = 2;
}

// ──────────────────────────────────────────────
// Shared types
// ──────────────────────────────────────────────

message ChatMessage {
  string role = 1;              // "system", "user", "assistant", "tool"
  string content = 2;
  repeated ToolCall tool_calls = 3;  // present on assistant messages
  string tool_call_id = 4;          // present on tool messages
  string tool_name = 5;             // present on tool messages
  string metadata_json = 6;         // optional JSON metadata (e.g. shell_command type, exit_code)
}

message ToolCall {
  string id = 1;
  string name = 2;
  string args_json = 3;  // JSON-encoded arguments
}
```

**New file:** `proto/codebox/sandbox/sandbox.proto`

### 4.2 gRPC Server in Orchestrator

Add a gRPC server (via `grpcio` / `grpcaio`) running alongside the existing FastAPI server. It listens on a separate port (e.g. `50051`).

Implements the `SandboxService.Connect` RPC:
- Receives `RegisterEvent` → authenticates (callback token), associates with box
- Sends `RegisteredCommand` → optionally followed by `ThreadRestoreCommand`
- Enters bidirectional message loop (replaces `ws_callback.py` logic)

**Changes:**
- New module: `codebox-orchestrator/src/codebox_orchestrator/grpc/` with generated stubs and server implementation
- `codebox-orchestrator/src/codebox_orchestrator/main.py` — start gRPC server alongside FastAPI
- `codebox-orchestrator/src/codebox_orchestrator/routes/ws_callback.py` — deprecate, eventually remove

### 4.3 gRPC Client in Sandbox

Replace the WebSocket callback client with a gRPC client that opens a `Connect` stream to the orchestrator.

**Changes:**
- `codebox-core/src/codebox_daemon/callback.py` — rewrite to use gRPC channel and `Connect` stream
- Environment variable: `ORCHESTRATOR_CALLBACK_URL` → `ORCHESTRATOR_GRPC_ADDRESS` (e.g. `orchestrator:50051`)

### 4.4 Authentication

The current approach (callback token as query parameter) maps to gRPC metadata. The sandbox sends the token as a metadata header on the `Connect` call:

```python
metadata = [("authorization", f"Bearer {callback_token}")]
stub.Connect(event_iterator(), metadata=metadata)
```

The orchestrator validates the token in a server interceptor.

### 4.5 Connection Lifecycle & Reconnection

- Sandbox uses gRPC's built-in retry policies and exponential backoff for reconnection
- On reconnect, sandbox re-sends `RegisterEvent`; orchestrator re-sends `ThreadRestoreCommand` if needed
- gRPC keepalive pings replace the current manual heartbeat logic

---

## 5. Migration Strategy

### Phase 1: Chat Memory (can be done independently)

1. Add `AsyncSqliteSaver` checkpointer to `codebox-core`
2. Refactor `agent_runner.py` to use `thread_id` config
3. Add `message_complete` event emission (still over WebSocket initially)
4. Add `box_messages` table to orchestrator
5. Persist `message_complete` events and user messages
6. Add `GET /api/boxes/{id}/messages` endpoint
7. Implement `thread_restore` flow on WebSocket reconnect

### Phase 2: gRPC Migration

1. Define protobuf schema, generate Python stubs
2. Implement gRPC server in orchestrator, replacing the WebSocket callback handler
3. Implement gRPC client in sandbox, replacing the WebSocket callback client
4. Remove old WebSocket callback code (`ws_callback.py`, WebSocket client in `callback.py`)
5. Update container spawn to pass `ORCHESTRATOR_GRPC_ADDRESS`

### Phase 3: Web UI Enhancements

1. Use `GET /api/boxes/{id}/messages` for full thread rendering
2. Show structured tool calls, tool results, and system messages in the chat UI
3. Support mid-conversation message injection (interrupt + send)

---

## 6. Dependencies

### codebox-core (new)

- `langgraph-checkpoint-sqlite` — async SQLite checkpointer
- `grpcio` / `grpcaio` — gRPC client
- Generated protobuf stubs

### codebox-orchestrator (new)

- `grpcio` / `grpcaio` — gRPC server
- `grpcio-reflection` (optional, for debugging)
- Generated protobuf stubs

### Build tooling

- `grpcio-tools` or `buf` — protobuf compilation
- Proto files live in `proto/` at repo root, shared by both sub-projects

---

## 7. Affected Files

### codebox-core

| File | Change |
|---|---|
| `src/codebox_daemon/agent.py` | Add checkpointer instantiation |
| `src/codebox_daemon/sessions.py` | Remove `messages` list, store `thread_id` |
| `src/codebox_daemon/agent_runner.py` | Use `thread_id` config, emit `message_complete`, send only new message |
| `src/codebox_daemon/callback.py` | Rewrite: WebSocket → gRPC client |
| `pyproject.toml` | Add `grpcio`, `langgraph-checkpoint-sqlite` |

### codebox-orchestrator

| File | Change |
|---|---|
| `src/codebox_orchestrator/db/models.py` | Add `BoxMessage` model |
| `src/codebox_orchestrator/schemas.py` | Add `BoxMessageSchema` |
| `src/codebox_orchestrator/routes/api.py` | Add `GET /api/boxes/{id}/messages` |
| `src/codebox_orchestrator/routes/ws_callback.py` | Remove (replaced by gRPC server) |
| `src/codebox_orchestrator/grpc/` | New: gRPC server, service implementation |
| `src/codebox_orchestrator/main.py` | Start gRPC server alongside FastAPI |
| `src/codebox_orchestrator/services/relay_service.py` | Accept events from gRPC handler (same interface) |
| `pyproject.toml` | Add `grpcio` |

### New files

| File | Purpose |
|---|---|
| `proto/codebox/sandbox/sandbox.proto` | gRPC service and message definitions |
