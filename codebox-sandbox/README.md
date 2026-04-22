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

## Pre-installed toolchain

The image ships with a default toolset so most agent tasks run without any
extra install step. All tools below are available on `PATH` in the daemon
and every agent subprocess (including interactive PTY sessions).

| Category      | Tools |
| ------------- | ----- |
| Languages     | Python 3.12 (base image), Node.js 20, Go 1.22, OpenJDK 21, Lua, GCC/G++ |
| Python tools  | `uv` |
| JS tools      | `pnpm`, `yarn`, `corepack` (bundled with Node) |
| Build         | `gnumake`, `cmake`, `pkg-config` |
| Search/FS     | `ripgrep`, `fd`, `tree`, `fzf`, `bat` |
| VCS / remote  | `git`, `gh`, `openssh`, `curl`, `wget`, `httpie` |
| Data / text   | `jq`, `yq` (go), `pandoc`, `poppler` (`pdftotext`, `pdftoppm`), `ghostscript`, `imagemagick`, `ffmpeg` |
| Diagrams      | `graphviz` (`dot`), `plantuml` |
| Databases     | `sqlite3`, `psql` (postgresql client) |
| Shell / ops   | `tmux`, `neovim` (`nvim`), `htop`, `shellcheck`, `openssl`, `gpg`, `unzip` |

### Installing extra packages at runtime

Both `devbox`/nix and `apt` are ready to use inside a running Box.

```sh
# Nix-based install (preferred — same pinned nixpkgs as the image)
devbox add texliveMedium          # or texliveFull for full LaTeX
devbox add rustup
devbox add nodejs@22              # parallel Node version

# Debian-based install (falls back to apt)
apt-get install -y <pkg>          # apt lists are pre-populated
```

### Why no `mermaid-cli` by default?

`@mermaid-js/mermaid-cli` (`mmdc`) needs a headless Chromium per invocation,
which starts slowly (2–5 s minimum), pulls in ~300 MB of nixpkgs chromium,
and is fragile in root containers with the default 64 MB `/dev/shm`. In
practice, rendering mermaid client-side in the web UI is a better fit. If a
Box genuinely needs server-side rendering, install it on demand:

```sh
devbox add nodePackages.mermaid-cli
# then pass a puppeteer config with --no-sandbox and --disable-dev-shm-usage
```

`devbox.lock` is committed in-repo, so image builds and runtime `devbox add`
resolve against the same nixpkgs commit. Maintainers refresh the pin by
running `devbox update && devbox install` inside `codebox-sandbox/` and
committing the updated lock.

## Env

The sandbox connects back to the orchestrator using:

- `CODEBOX_ORCHESTRATOR_URL` — base URL (e.g. `http://localhost:9090`)
- `CODEBOX_CALLBACK_TOKEN`   — JWT identifying the box

Both are required for tunnel/file/PTY features.  If either is missing,
only the gRPC callback starts.
