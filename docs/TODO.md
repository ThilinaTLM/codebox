# New Features Roadmap

## 1. GitHub App Integration

### Overview

A GitHub App that lets users trigger sandbox agents directly from GitHub issue comments. An orchestrator service listens for GitHub App webhook events, spawns sandbox containers with the relevant context and GitHub credentials, and the agent works autonomously — cloning the repo, implementing changes, and opening a PR.

### Example Flow

1. User creates a GitHub issue describing a feature request or bug
2. User comments `@codebox` on the issue
3. Orchestrator service receives the webhook event
4. Orchestrator extracts context (issue body, comment thread, repo info)
5. Orchestrator spawns a sandbox container with:
   - Starting prompt and instructions derived from the issue
   - GitHub token scoped to the repository
   - Relevant repo context (structure, conventions, referenced files)
6. Agent clones the repo, works on the task, creates a branch, and opens a PR
7. Agent comments on the original issue linking the PR

### Context Extraction

Building the right prompt is critical. The orchestrator should pull:

- Issue title, body, and full comment thread
- Repository structure and relevant files (potentially via code search or embeddings)
- Referenced issues and PRs
- Repo conventions (linting rules, test patterns, contribution guidelines, CLAUDE.md equivalents)

### Feedback Loop — Human-in-the-Loop

The agent has access to a `request_human_feedback` tool (similar to `create_pr`). When the agent needs clarification or is blocked, it calls this tool with a question/context. The orchestrator then routes the feedback request to the appropriate channel:

- **GitHub**: posts a comment on the issue thread asking for input
- **Slack**: sends a message to a configured channel/thread with the question
- **Web UI**: displays an inline prompt in the task detail view

**Immediate response**: if a human replies quickly, the orchestrator forwards the response back to the running sandbox agent over the WebSocket connection, and the agent continues.

**Delayed response**: if no response arrives within a configurable timeout, the orchestrator stops the sandbox container to free resources. When the human eventually responds, the orchestrator restarts the sandbox (or spins up a new one with the same mounted data volume) and resumes the task with the feedback injected into context.

**PR review follow-up**: `@codebox` on a PR review comment triggers a follow-up session with the PR diff and review comments as context.

### Abuse / Cost Controls

- Allowlist of repositories and organizations
- Per-repo concurrency limits
- Timeout and budget caps per sandbox session
- Rate limiting per user/org

---

## 2. Container Runtime Backends

### Priority Order

1. **Docker (Local)** — current implementation
2. **Docker (Remote)** — over TCP or SSH
3. **Podman (Remote)** — over TCP or SSH
4. **AWS Fargate** — serverless containers

### Future Considerations

- **Kubernetes** — for teams already running K8s clusters
- **Google Cloud Run / Azure ACI** — serverless container alternatives for multi-cloud
- **Firecracker microVMs** — strongest isolation, purpose-built for multi-tenant sandboxing
- **Nomad** — simpler orchestration alternative to K8s

### ContainerHost Abstraction

A unified interface across all runtimes:

```
ContainerHost (interface)
├── LocalDockerHost        (current)
├── RemoteDockerHost       (Docker over TCP/SSH)
├── RemotePodmanHost       (Podman over TCP/SSH)
└── FargateHost            (AWS API)
```

Core interface methods:

- `create_container` — provision and configure the sandbox
- `start` — start the container
- `stop` — stop and clean up
- `exec` — run a command inside the container
- `get_logs` — retrieve container logs
- `get_ip` — get the container's reachable address

Remote Docker and Podman are nearly identical (both OCI-compliant), so the remote abstraction should be straightforward. Fargate is different — task provisioning is async and networking is ENI-based — which motivates the reverse connection model below.

---

## 3. Reverse Connection Model

### Problem

In the current model, the CLI/orchestrator connects to the sandbox container via WebSocket. This works for local Docker but breaks down with:

- **Fargate**: tasks get dynamic IPs, requiring service discovery or stable networking config
- **Remote hosts**: firewall rules, NAT traversal, port mapping complexity
- **Kubernetes**: service/ingress configuration per sandbox

### Proposed Solution

Invert the connection direction. Instead of the orchestrator connecting to the container, the container connects back to the orchestrator on startup.

```
Current:    Orchestrator  ──WebSocket──>  Sandbox Container
Proposed:   Orchestrator  <──WebSocket──  Sandbox Container
```

### How It Works

1. Orchestrator spawns a sandbox container, passing its own address and a one-time connection token as environment variables
2. Container starts, initializes the agent runtime, then connects back to the orchestrator via WebSocket
3. Orchestrator authenticates the connection using the token and assigns work from a task queue
4. All communication flows over this container-initiated WebSocket connection

### Benefits

- **Runtime-agnostic**: works identically across local Docker, remote Docker/Podman, Fargate, and K8s — the container just needs outbound network access to the orchestrator
- **Firewall-friendly**: outbound connections from sandboxes are easier than opening inbound ports on dynamic containers
- **No service discovery needed**: the orchestrator address is stable and known; no need to track dynamic container IPs
- **Same proven pattern**: GitHub Actions runners, GitLab runners, and Buildkite agents all use this model

### Task Queue Integration

With the reverse connection model, the orchestrator becomes a task broker:

1. GitHub webhook (or other trigger) creates a task in the queue
2. Orchestrator spawns a sandbox container for the task
3. Container connects back and pulls its assigned task
4. Container streams progress/results back over the WebSocket
5. On completion, the container reports results and shuts down

This cleanly separates task creation (webhook handling) from task execution (sandbox), and allows for future features like task retries, priority queues, and warm container pools.

---

## 4. Web UI Dashboard

### Overview

A web interface for the orchestrator service that provides visibility into all agent activity and enables human interaction with running agents.

### Features

- **Task list view**: all tasks with status (queued, running, waiting for feedback, completed, failed), trigger source (issue link), timestamps, and assigned sandbox ID
- **Task detail view**: real-time stream of agent activity — tool calls, file edits, command outputs, LLM reasoning — similar to watching a terminal session live
- **Human feedback inline**: when an agent calls `request_human_feedback`, the web UI shows a prompt that a human can respond to directly, without going through GitHub or Slack
- **Task history**: full audit trail of past tasks including agent logs, generated diffs, and created PRs
- **Container status**: which sandboxes are running, stopped, or available for reuse

---

## 5. Task Queue and State Management

### Overview

A persistent task queue that tracks all tasks, their lifecycle, and the resources associated with them. This is the central coordination point between triggers (GitHub webhooks, manual), the orchestrator, and sandbox containers.

### Task Record

Each task tracks:

| Field               | Description                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- |
| `task_id`           | Unique identifier                                                                  |
| `status`            | `queued` · `running` · `waiting_for_feedback` · `stopped` · `completed` · `failed` |
| `trigger`           | What created the task — issue comment URL, PR review, manual, etc.                 |
| `context`           | Extracted prompt, issue body, repo info, conversation history                      |
| `sandbox_id`        | Current or most recent sandbox container ID                                        |
| `data_volume`       | Persistent volume/mount path for the sandbox workspace                             |
| `feedback_requests` | List of pending/resolved human feedback interactions                               |
| `created_at`        | When the task was queued                                                           |
| `updated_at`        | Last state change                                                                  |
| `result`            | Outcome — PR URL, error details, etc.                                              |

### Sandbox Lifecycle with Stop/Resume

When a sandbox is stopped (e.g., waiting for human feedback timeout), the task's workspace is preserved:

1. **All workspace data is on a mounted volume** — repo clone, agent state, file changes are all persisted independently of the container
2. **On resume**, the orchestrator can either:
   - **Restart the same sandbox** if the container still exists (just stopped, not removed)
   - **Spin up a new sandbox** and mount the same data volume — works across any runtime since the data is decoupled from the container
3. **Context continuity**: the task record holds the full conversation history and feedback responses, which get injected into the agent's prompt on resume

This makes the system resilient to container churn and allows cost-efficient operation — sandboxes only run when there's active work to do.

### Task State Machine

```
                  ┌──────────────────────────────┐
                  │                              │
                  v                              │
queued ──> running ──> completed                 │
              │                                  │
              ├──> failed                        │
              │                                  │
              └──> waiting_for_feedback          │
                      │                          │
                      ├──> stopped (timeout)     │
                      │       │                  │
                      │       └── (feedback arrives) ──> queued ─┘
                      │
                      └── (immediate reply) ──> running
```

### Integration Points

- **GitHub App webhooks** create tasks from issue/PR comments
- **Slack integration** routes feedback requests and receives replies
- **Web UI** provides visibility and manual feedback capability
- **Container runtimes** (via ContainerHost) handle the actual sandbox lifecycle
- **Reverse WebSocket** connects running sandboxes back to the orchestrator for real-time streaming

---

## 6. Environment Management and Sandbox Caching

### Problem

The base sandbox image ships with a common set of packages via Devbox, but different repositories need different toolchains (e.g., a Python ML repo needs CUDA libs, a Go repo needs specific Go versions, a Node repo needs particular Node/npm versions). Installing these on every sandbox spawn is slow and wasteful — especially when the same repo triggers multiple tasks.

### Package Installation: Shell, Not Tools

The agent should install packages via shell commands it already has access to — no special tools needed:

- `devbox add <package>` for Nix-managed packages
- `apt-get install` for system packages
- `pip install`, `npm install`, `cargo install`, etc. for language-specific deps

Repos can declare what they need via a **`.codebox.toml`** config file in the repo root:

```toml
[environment]
# Devbox packages to add
devbox_packages = ["python312", "nodejs_20", "ffmpeg"]

# System packages
apt_packages = ["libpq-dev"]

# Shell commands to run during setup
setup_commands = [
    "pip install -r requirements.txt",
    "npm ci",
]
```

The orchestrator reads this file after cloning and runs the setup before handing the sandbox to the agent. This keeps environment setup declarative and version-controlled with the repo.

### Per-Repo Sandbox Caching

To avoid re-doing environment setup for every task, maintain **cached sandbox images per repository**:

#### Strategy: Repo-Specific Base Images

```
Base Image (codebox-docker)
    │
    └── repo-specific layer (cached)
            │  - repo cloned
            │  - .codebox.toml setup applied
            │  - devbox/apt packages installed
            │  - dependencies installed
            │
            └── task sandbox (ephemeral)
                   - fresh branch for the task
                   - agent runs here
```

#### How It Works

1. **First task for a repo**: orchestrator spawns a sandbox from the base image, clones the repo, runs `.codebox.toml` setup. After setup completes, **snapshot the container** as a repo-specific cached image (e.g., `codebox-cache:org/repo:abc123` where `abc123` is the setup config hash).

2. **Subsequent tasks for the same repo**: orchestrator spawns from the cached image instead of the base image. Skip clone and setup — just `git pull` to get latest changes and start the agent. This turns a multi-minute setup into seconds.

3. **Cache invalidation**: re-build the cached image when:
   - `.codebox.toml` changes (detected via config hash)
   - Base codebox image is updated
   - Manual invalidation via orchestrator API/UI
   - TTL expiry (e.g., rebuild weekly regardless)

#### Implementation per Runtime

| Runtime                   | Caching mechanism                                               |
| ------------------------- | --------------------------------------------------------------- |
| **Docker (Local/Remote)** | `docker commit` to create cached image, store in local registry |
| **Podman**                | Same — `podman commit`, local or remote registry                |
| **Fargate**               | Push cached image to ECR, reference in task definition          |
| **Kubernetes**            | Push to container registry, use as pod image                    |

#### Warm Container Pools (Future)

For high-traffic repos, go further and keep **warm containers** pre-provisioned:

- Orchestrator maintains a pool of N ready-to-go sandboxes per repo
- New task gets assigned an already-running warm container immediately
- Pool replenishes in the background after a container is claimed
- Idle containers are recycled after a configurable timeout

This gives near-instant task startup for frequently-used repos.
