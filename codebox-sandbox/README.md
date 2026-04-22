# codebox-sandbox

Container runner for the Codebox agent.  Runs inside each sandbox
container and opens outbound connections back to the orchestrator.

## Processes

On startup, `__main__._run_all` launches up to four concurrent asyncio
tasks:

| Task           | Purpose                                                            |
| -------------- | ------------------------------------------------------------------ |
| `grpc-callback`| Bidirectional gRPC stream — agent events + orchestrator commands.  |
| `file-server`  | HTTP server on `127.0.0.1:19080` for workspace file operations.    |
| `pty-server`   | TCP server on `127.0.0.1:19081` for interactive terminal sessions. |
| `tunnel`       | WebSocket + yamux tunnel that proxies file + PTY traffic back up.  |

The file server and PTY server bind only to loopback — they are reached
exclusively through the yamux tunnel, never exposed externally.

## PTY server

- One interactive shell per connection; sessions do **not** survive the
  stream closing.
- Wire protocol is defined in `codebox_tunnel.pty_frames`.
- The spawned shell inherits a minimal, allow-listed environment so
  orchestrator secrets (`CODEBOX_*`, `*_API_KEY`, `*_TOKEN`, …) are not
  leaked to anything the user types.
- The shell runs in its own session (`os.setsid`) so SIGHUP to the pgid
  cleans up background jobs when the client disconnects.

Terminal I/O is a raw byte stream — it is deliberately **not** written
to the canonical box event log or to the agent's LangGraph state, so the
LLM does not see what the user ran in the terminal.

## Env

The sandbox connects back to the orchestrator using:

- `CODEBOX_ORCHESTRATOR_URL` — base URL (e.g. `http://localhost:9090`)
- `CODEBOX_CALLBACK_TOKEN`   — JWT identifying the box

Both are required for tunnel/file/PTY features.  If either is missing,
only the gRPC callback starts.
