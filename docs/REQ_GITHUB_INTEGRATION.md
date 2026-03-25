# GitHub Integration Requirements

## 1. Overview

Integrate a GitHub App into the codebox platform so that users can trigger sandbox agents directly from GitHub (issues, PRs, comments) and receive results back as PRs, comments, and status checks. The integration lives primarily in the orchestrator, making it available to all clients (web-ui, CLI) without modifying codebox-core.

### Goals

- Trigger agent tasks from GitHub issue/PR comments (e.g. `@codebox implement this`)
- Automatically clone repos, create isolated branches, and set up credentials in sandboxes
- Push branches, open PRs, and comment results back on GitHub
- Support human-in-the-loop feedback via GitHub comment threads
- Provide abuse and cost controls per repo/org
- Provide a web UI flow for installing the GitHub App on repos/orgs

### Non-Goals (for initial release)

- GitHub Actions integration (running as a GitHub Action)
- Marketplace listing / public app distribution
- Multi-tenant SaaS hosting — initially self-hosted only
- Code review automation (auto-reviewing PRs without being asked)

---

## 2. Architecture

```
                                  ┌─────────────────────────────────────┐
                                  │         GitHub                      │
                                  │  (webhooks, API, app installation)  │
                                  └──────┬──────────────────▲───────────┘
                                         │ webhook          │ API (PRs,
                                         │                  │ comments,
                                         ▼                  │ statuses)
┌──────────────┐    REST     ┌───────────────────────┐      │
│ codebox-web-ui│──────────>│  codebox-orchestrator  │──────┘
│              │<───────────│                        │
│ Settings >   │            │  - webhook receiver    │──spawns──> [sandbox container]
│ GitHub page  │            │  - token management    │                  │
│ (install app)│            │  - clone + branch      │ <── WebSocket ───┘
└──────────────┘            │  - task lifecycle      │
                            └────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **GitHub App** | Receives webhooks, provides installation tokens, defines permissions |
| **Orchestrator** | Webhook ingestion, task creation, repo cloning, branch creation, credential injection, result push-back |
| **Sandbox** | Receives pre-cloned repo on an isolated branch, runs agent, commits/pushes via git and `gh` CLI |
| **Web UI** | GitHub App installation flow (Settings page), display GitHub-linked tasks |

### Why the Orchestrator (Not the Sandbox)

- Single point for webhook handling and credential management
- Orchestrator handles cloning and branch creation — agent receives a ready-to-use workspace
- Every sandbox gets GitHub support without image changes
- Centralized rate limiting and abuse controls
- Consistent audit trail of all GitHub interactions

---

## 3. GitHub App Configuration

### App Type

A **GitHub App** (not an OAuth App or personal access tokens). Reasons:

- Fine-grained, per-repository permissions
- Short-lived installation tokens (no long-lived secrets in sandboxes)
- Bot identity for comments/PRs (appears as `codebox[bot]`)
- Webhook delivery built-in
- Higher rate limits than PATs

### Required Permissions

| Permission | Access | Purpose |
|-----------|--------|---------|
| **Contents** | Read & Write | Clone repos, push branches |
| **Pull requests** | Read & Write | Create/update PRs, read PR diffs |
| **Issues** | Read & Write | Read issue context, post comments |
| **Commit statuses** | Read & Write | Set status checks on commits |
| **Metadata** | Read | Repository metadata |

### Webhook Events

| Event | Trigger |
|-------|---------|
| `installation.created` | App installed on a repo/org (for auto-capturing installations) |
| `issue_comment.created` | User mentions `@codebox` in an issue comment |
| `pull_request_review_comment.created` | User mentions `@codebox` in a PR review comment |
| `issues.opened` | (Optional) Auto-trigger on new issues with specific labels |
| `pull_request.opened` | (Optional) Auto-review PRs with specific labels |

### App Registration

The app is registered once by the platform operator. The orchestrator stores:

- App ID, private key (for generating JWTs)
- App slug (for constructing installation URLs)
- Webhook secret (for signature verification)
- Installation IDs per org/repo (received via installation webhooks or callback)

---

## 4. GitHub App Installation Flow (Web UI)

Users connect their GitHub repos to codebox through the web UI.

### Primary Flow: OAuth-Style Callback

```
1. User navigates to Settings > GitHub in the web UI
2. User clicks "Connect GitHub"
3. Web UI redirects to: https://github.com/apps/{app-slug}/installations/new
4. User selects org/repos and installs the app on GitHub
5. GitHub redirects back to: https://{our-domain}/api/github/callback?installation_id=12345
6. Orchestrator receives the callback, stores the installation ID and metadata
7. Web UI shows the connected org/repos
```

The callback URL (`https://{our-domain}/api/github/callback`) must be configured as the **Setup URL** in the GitHub App settings.

### Fallback: Manual Setup

The Settings > GitHub page also provides a form where users can manually enter a GitHub App installation ID. This covers cases where:

- The callback redirect doesn't work (e.g. network/proxy issues)
- The operator wants to set up installations via CLI or API directly
- Testing/development without a publicly reachable callback URL

### Web UI: Settings > GitHub Page

The page displays:

- **Connect GitHub** button (primary flow)
- **Manual installation ID** input (fallback)
- **Connected installations** list showing:
  - Org/user account name
  - List of repos accessible to the installation
  - Installation date
  - "Sync repos" action (re-fetches repo list from GitHub API)
  - "Remove" action (deletes the installation record; does not uninstall the app from GitHub)

---

## 5. Authentication and Credential Flow

### Installation Token Lifecycle

```
1. Task is triggered (webhook or manual)
2. Orchestrator identifies the installation ID for the repo
3. Orchestrator generates a JWT (signed with app private key)
4. Orchestrator exchanges JWT for an installation token (expires in 1 hour)
5. Token is injected into sandbox as the GH_TOKEN environment variable
6. Sandbox uses GH_TOKEN for both git HTTPS auth and gh CLI operations
7. For long-running tasks, orchestrator refreshes the token and sends
   the new token to the sandbox over WebSocket
```

### Credential Injection into Sandbox

The sandbox receives these environment variables:

```bash
GH_TOKEN=ghs_xxxx                        # Installation token (used by both git and gh CLI)
CODEBOX_GITHUB_REPO=owner/repo            # Target repository
CODEBOX_GITHUB_REF=main                   # Base branch the working branch was created from
CODEBOX_BRANCH=codebox/42-fix-login-bug   # Working branch (already checked out)
CODEBOX_GITHUB_ISSUE_NUMBER=42            # Triggering issue/PR number (if applicable)
```

**Why `GH_TOKEN`:** The `gh` CLI automatically picks up `GH_TOKEN` for authentication — no `gh auth login` needed. `GH_TOKEN` takes precedence over `GITHUB_TOKEN` when both are set, giving us explicit control. The same token is used for git HTTPS operations.

Git is configured inside the sandbox by the orchestrator during setup:

```bash
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
```

### gh CLI in Sandbox

The sandbox image (codebox-sandbox) must ship with the `gh` CLI pre-installed. With `GH_TOKEN` set, the agent can use `gh` directly for:

- `gh pr create` — open pull requests
- `gh issue comment` — comment on issues
- `gh pr view` — inspect PR details
- `gh api` — arbitrary GitHub API calls

This gives the agent full GitHub interaction capabilities from a single token, without any login steps.

### Security Constraints

- Tokens are scoped to a single installation (org/repo set)
- Tokens expire after 1 hour — orchestrator handles refresh for long tasks
- Sandbox containers have no access to the app private key
- Tokens are not logged or persisted to disk inside sandboxes
- `GH_TOKEN` is injected as an env var, not written to any config file

---

## 6. Webhook Processing

### Ingestion Pipeline

```
Webhook received
  │
  ├── Verify signature (HMAC SHA-256 with webhook secret)
  │
  ├── Parse event type + payload
  │
  ├── Handle installation events:
  │     - installation.created → store installation ID
  │
  ├── Check trigger conditions:
  │     - Is the repo/org in the allowlist?
  │     - Does the comment mention @codebox?
  │     - Is the user authorized?
  │     - Are rate limits / concurrency limits OK?
  │
  ├── Extract context (see Section 7)
  │
  └── Create task in orchestrator task queue
```

### Trigger Detection

A webhook creates a task when:

1. **Issue comment**: comment body contains `@codebox` (or configured bot name)
2. **PR review comment**: comment body contains `@codebox`
3. **Issue opened**: issue has a configured label (e.g. `codebox`)
4. **PR opened**: PR has a configured label

The text after the `@codebox` mention becomes the task instruction. If no instruction is provided, the full issue/PR body is used as context.

### Deduplication

- Ignore webhook retries (track delivery IDs)
- Ignore edits to comments that already triggered a task
- Ignore bot's own comments to prevent loops

---

## 7. Context Extraction

Building the right prompt is critical. The orchestrator assembles context from the GitHub API before spawning a sandbox.

### Context Sources

| Source | Data Extracted |
|--------|---------------|
| **Issue/PR body** | Title, description, labels |
| **Comment thread** | Full conversation history on the issue/PR |
| **Repository metadata** | Default branch, language, topics |
| **Referenced issues/PRs** | Cross-referenced context |
| **Repository files** | `.codebox.toml`, `CLAUDE.md`, `CONTRIBUTING.md`, `.github/` templates |

### Prompt Assembly

The orchestrator constructs a prompt for the sandbox agent. Note that cloning and branch creation are already done by the orchestrator — the agent receives a ready-to-use workspace.

```
You are working on repository {owner}/{repo}.
You are on branch {codebox_branch}, created from {base_branch}.

## Task
{instruction from @codebox mention, or issue body}

## Issue Context
Title: {issue_title}
Body: {issue_body}

## Conversation
{formatted comment thread}

## Repository Guidelines
{contents of CLAUDE.md, CONTRIBUTING.md, etc. if present}

## Instructions
- The repository is cloned into /workspace (your CWD) and you are on branch {codebox_branch}
- Full issue context is also available at /workspace/.codebox/context.md
- Implement the requested changes
- Write tests if applicable
- Commit your changes with descriptive messages
- Push your branch and open a pull request
- Reference issue #{issue_number} in the PR description
```

---

## 8. Sandbox Setup and Git Workflow

### Workspace Layout

The repo is cloned directly into `/workspace` — the repo root IS the workspace root. The agent's CWD is the repo root, so all tools, linters, test runners, and git commands work without path adjustments.

```
/workspace/                    # = repo root, agent CWD
├── .git/
│   ├── info/
│   │   └── exclude            # hides .codebox/ from git status (local-only, never committed)
│   └── hooks/
│       └── pre-push           # branch safety hook (injected by orchestrator)
├── .codebox/                  # orchestrator metadata (excluded from git via .git/info/exclude)
│   ├── task.json              # task ID, trigger info, branch name
│   └── context.md             # issue body, conversation thread (for agent reference)
├── src/
├── package.json
├── CLAUDE.md
└── ...
```

**Key decisions:**

- **Repo cloned into `/workspace` directly** (not as a subdirectory). The agent never needs to `cd` into a repo — `/workspace` is both the CWD and the repo root. This avoids a whole class of path-related agent errors.
- **`.codebox/` directory** for orchestrator metadata, hidden from git via `.git/info/exclude` (not `.gitignore`). `.git/info/exclude` is local-only — never committed, never pushed, never shows up in diffs. This keeps `git status` clean without touching any tracked files.
- **Context is primarily in the agent prompt** (Section 7). The `.codebox/context.md` file is a supplementary reference the agent can read if it needs to re-check issue details during a long task, but the prompt is the primary source of context.

### Sandbox Setup (Orchestrator Responsibility)

Before handing the sandbox to the agent, the orchestrator performs:

```
1. Clone the repository into /workspace (repo root = workspace root)
2. Generate branch name:
   - GitHub-triggered: codebox/{issue_number}-{slug}
     (e.g. codebox/42-fix-login-bug, slug derived from issue title)
   - Manual/non-GitHub: codebox/{random-readable-name}
     (e.g. codebox/gentle-river)
3. Create and check out the branch
4. Inject credentials (GH_TOKEN env var, git url rewrite config)
5. Install pre-push safety hook (see Section 9)
6. Create .codebox/ directory with task metadata
7. Add .codebox/ to .git/info/exclude
8. Hand over to the agent
```

The agent receives a workspace that is:
- Cloned directly into `/workspace` — repo root is the CWD
- On an isolated `codebox/*` branch
- Authenticated for git push and `gh` CLI operations
- Protected by a pre-push hook preventing pushes outside `codebox/*`
- Clean `git status` (no untracked orchestrator files visible)

### Agent Workflow: Issue → PR

```
1. Agent works on the task (edit files, run tests, etc.)
2. Commit changes with descriptive message
3. Push branch to origin (pre-push hook validates branch name)
4. Create PR via gh CLI:
   - Title derived from issue title or agent summary
   - Body includes: what was done, link to triggering issue
   - References: "Closes #{issue_number}" for auto-close
5. Comment on original issue linking the PR
```

### Agent Workflow: PR Review Follow-Up

```
1. @codebox mentioned on a PR review comment
2. Orchestrator extracts: PR diff, review comments, existing branch
3. Orchestrator sets up sandbox with the existing PR branch checked out
   (no new branch — agent works on the same branch)
4. Agent addresses the review feedback
5. Commits and pushes to the same branch (PR updates automatically)
6. Agent replies to the review comment with what was changed
```

### Commit Conventions

Commits made by the agent follow the format:

```
<type>: <description>

Co-authored-by: <triggering_user>
Triggered-by: <issue_or_pr_url>
```

---

## 9. Branch Safety Guards

Defense-in-depth approach to prevent the agent from accidentally (or intentionally) pushing to protected branches like `main`.

### Layer 1: Orchestrator Creates the Branch

The agent never creates branches. The orchestrator creates and checks out a `codebox/*` branch before the agent starts. The agent only needs to commit and push.

### Layer 2: Pre-Push Hook (Client-Side)

After cloning and creating the branch, the orchestrator writes a git pre-push hook into the sandbox:

```bash
# .git/hooks/pre-push (injected by orchestrator, not baked into image)
#!/bin/bash
while read local_ref local_sha remote_ref remote_sha; do
    branch=$(echo "$remote_ref" | sed 's|refs/heads/||')
    if [[ ! "$branch" =~ ^codebox/ ]]; then
        echo "ERROR: Push rejected. Can only push to codebox/* branches."
        echo "Attempted to push to: $branch"
        exit 1
    fi
done
exit 0
```

**Why injected, not baked into the image:**
- Hook logic can be updated without rebuilding codebox-sandbox
- Different repos could get different hook configurations in the future
- The orchestrator controls the full sandbox setup sequence

**Limitation:** The agent can bypass this with `git push --no-verify`. This is why Layer 3 exists.

### Layer 3: GitHub Branch Rulesets (Server-Side, Recommended)

Users should configure GitHub repository rulesets to enforce branch protection at the server level. This cannot be bypassed by the agent regardless of what it does inside the sandbox.

**Recommended ruleset configuration:**

1. **Protect default branch** (`main`/`master`):
   - Restrict pushes: only allow through pull requests
   - Require PR reviews before merging

2. **Allow `codebox/**` branches:**
   - Allow the GitHub App to create and push to branches matching `codebox/**`
   - No review requirements on these branches (the agent needs to push freely)

This is documented as a **recommended setup step** when users install the GitHub App, not enforced by the orchestrator.

---

## 10. Result Reporting

### On Task Completion

The orchestrator (or sandbox via `gh` CLI) reports results back to GitHub:

| Outcome | GitHub Action |
|---------|--------------|
| **Success (PR created)** | Comment on issue with PR link, set commit status `success` |
| **Success (changes pushed)** | Comment on PR review thread confirming changes |
| **Failure** | Comment on issue/PR with error summary, set commit status `failure` |
| **Needs feedback** | Comment on issue/PR with question (see Section 11) |

### Comment Format

```markdown
## Codebox Agent Result

**Status**: Completed
**PR**: #123

### Summary
- Added input validation to the `/api/users` endpoint
- Added unit tests for edge cases
- Updated API documentation

### Details
[Link to full task log in web UI]
```

---

## 11. Human-in-the-Loop Feedback

### Feedback Request Flow

When the agent calls `request_human_feedback`:

```
Agent (sandbox)
  │
  ├── Calls request_human_feedback tool with question + context
  │
  ├── Sandbox sends feedback request to orchestrator via WebSocket
  │
  └── Orchestrator routes to appropriate channel:
        │
        ├── GitHub: posts comment on the issue/PR thread
        ├── Web UI: displays inline prompt in task detail view
        └── Slack: sends message to configured channel (future)
```

### Response Handling

**Immediate response** (human replies while sandbox is still running):

1. Human replies on GitHub (or web UI)
2. Webhook delivers the reply to the orchestrator
3. Orchestrator forwards the reply to the sandbox via WebSocket
4. Agent continues with the feedback

**Delayed response** (sandbox times out waiting):

1. Sandbox is stopped after configurable timeout (default: 30 minutes)
2. Workspace data is preserved on a mounted volume
3. When human eventually replies:
   a. Webhook delivers the reply to the orchestrator
   b. Orchestrator creates a new task (or resumes the existing one)
   c. New sandbox is spawned with the same data volume
   d. Agent resumes with the feedback injected into context

### Preventing Feedback Loops

- Only comments from users (not bots) trigger feedback responses
- The orchestrator tracks which comments are feedback requests vs. responses
- A task has a maximum number of feedback rounds (configurable, default: 5)

---

## 12. Abuse and Cost Controls

### Access Controls

| Control | Description |
|---------|-------------|
| **Org/repo allowlist** | Only configured organizations and repositories can trigger tasks |
| **User allowlist** | (Optional) Only specific users can invoke `@codebox` |
| **Label gating** | Require a specific label on issues/PRs before allowing triggers |

### Rate Limiting

| Limit | Default | Description |
|-------|---------|-------------|
| **Per-repo concurrency** | 2 | Max simultaneous tasks per repository |
| **Per-org concurrency** | 5 | Max simultaneous tasks per organization |
| **Per-user rate** | 10/hour | Max task triggers per user per hour |
| **Global concurrency** | 20 | Max simultaneous tasks across all repos |

### Resource Limits

| Limit | Default | Description |
|-------|---------|-------------|
| **Task timeout** | 60 min | Max wall-clock time per task |
| **Feedback wait timeout** | 30 min | Max time sandbox waits for human feedback |
| **Max feedback rounds** | 5 | Max human-in-the-loop interactions per task |
| **Container CPU** | 2 cores | CPU limit per sandbox |
| **Container memory** | 4 GB | Memory limit per sandbox |

---

## 13. Data Model Changes

### New Tables / Models

#### `github_installations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `installation_id` | INTEGER | GitHub App installation ID |
| `account_login` | VARCHAR | Org or user login |
| `account_type` | VARCHAR | `Organization` or `User` |
| `created_at` | TIMESTAMP | When the app was installed |
| `settings` | JSON | Per-installation config (allowlists, limits) |

#### `github_events`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `delivery_id` | VARCHAR | GitHub webhook delivery ID (for dedup) |
| `event_type` | VARCHAR | e.g. `issue_comment` |
| `action` | VARCHAR | e.g. `created` |
| `repository` | VARCHAR | `owner/repo` |
| `payload` | JSON | Raw webhook payload |
| `task_id` | UUID | FK to tasks table (if a task was created) |
| `created_at` | TIMESTAMP | When the event was received |

### Task Table Extensions

Add to the existing `tasks` table:

| Column | Type | Description |
|--------|------|-------------|
| `github_installation_id` | UUID | FK to `github_installations` |
| `github_repo` | VARCHAR | `owner/repo` |
| `github_issue_number` | INTEGER | Triggering issue/PR number |
| `github_trigger_url` | VARCHAR | URL of the triggering comment |
| `github_branch` | VARCHAR | Branch created for the task (e.g. `codebox/42-fix-login-bug`) |
| `github_pr_number` | INTEGER | PR number if one was created |

---

## 14. Orchestrator API Additions

### New Endpoints

```
POST   /api/github/webhook                     # GitHub webhook receiver
GET    /api/github/callback                     # GitHub App installation callback (redirect target)
GET    /api/github/installations                # List installations
POST   /api/github/installations                # Manually add an installation by ID (fallback)
POST   /api/github/installations/{id}/sync      # Sync repos for an installation
DELETE /api/github/installations/{id}           # Remove an installation record
GET    /api/github/repos                        # List repos across all installations
GET    /api/github/repos/{owner}/{repo}/tasks   # Tasks for a specific repo
```

### Configuration

```python
# Environment variables (required)
GITHUB_APP_ID=12345
GITHUB_APP_PRIVATE_KEY_PATH=/etc/codebox/github-app.pem
GITHUB_WEBHOOK_SECRET=whsec_xxxx
GITHUB_APP_SLUG=codebox                  # Used for installation redirect URL

# Optional
GITHUB_BOT_NAME=codebox                  # Trigger keyword (default: app slug)
GITHUB_DEFAULT_BASE_BRANCH=main          # Fallback base branch
```

---

## 15. Platform Changes Required

The GitHub integration depends on capabilities that codebox-core and the orchestrator do not currently support. These changes are prerequisites and benefit the platform beyond just the GitHub use case.

The session configuration is organized into three pillars:

1. **System prompt** — inject additional context and instructions (already supported)
2. **Environment variables** — inject credentials and metadata into the container
3. **Sandbox configuration** — control agent behavior: tools, timeouts, recursion depth

### 15.1 Extended Session Configuration (codebox-core)

**Current state:** `CreateSessionRequest` accepts `system_prompt`, `working_dir`, `model`, and `api_key`. Everything else is hardcoded in `create_agent()`:
- Tools: all middleware tools always registered, no filtering
- Timeout: 120s (hardcoded in `LocalShellBackend`)
- Recursion limit: 150 (hardcoded in `ws.py`)
- Temperature: 0 (hardcoded in `create_agent()`)

**Proposed `CreateSessionRequest`:**

```python
{
    # Existing fields
    "model": "...",
    "api_key": "...",
    "system_prompt": "...",                   # Already supported
    "working_dir": "/workspace",              # Already supported

    # New: optional tools
    "optional_tools": [],                     # List of optional tool names to enable

    # New: sandbox configuration
    "sandbox_config": {
        "timeout": 120,                       # Shell command timeout in seconds
        "recursion_limit": 150,               # Max agent loop iterations
        "temperature": 0,                     # LLM temperature
    }
}
```

All new fields are optional with sensible defaults — omitting them preserves current behavior (backward compatible).

#### Tool Classification

Tools are classified as **core** (always available, cannot be disabled) or **optional** (disabled by default, enabled per session).

**Core tools** (always registered, not configurable):

| Tool | Source | Description |
|------|--------|-------------|
| `ls` | FilesystemMiddleware | List directory contents |
| `read_file` | FilesystemMiddleware | Read file content (with pagination) |
| `write_file` | FilesystemMiddleware | Create new files |
| `edit_file` | FilesystemMiddleware | Edit existing files via string replacement |
| `glob` | FilesystemMiddleware | Find files by glob pattern |
| `grep` | FilesystemMiddleware | Search file contents |
| `execute` | FilesystemMiddleware | Run shell commands |
| `task` | SubAgentMiddleware | Launch subagent for isolated tasks |
| `write_todos` | TodoListMiddleware | Manage a todo list |

These are the current tools in the deepagents framework. They form the baseline capability of every sandbox agent and cannot be disabled.

**Optional tools** (disabled by default, enabled per session):

Optional tools are additional capabilities that may not be appropriate for every task. They must be explicitly enabled via the `optional_tools` field.

| Tool | Description | Use case |
|------|-------------|----------|
| `create_pr` | Create a GitHub pull request | GitHub-triggered tasks |
| `request_human_feedback` | Ask a human for input | Human-in-the-loop |
| `web_search` | Search the web | Research tasks |
| `web_fetch` | Fetch a URL | Documentation lookup |

*(These are not yet implemented — listed as examples of the kind of tools this system supports.)*

**How it works:**
- `optional_tools` accepts a list of optional tool names to enable for this session
- If omitted or empty, only core tools are available (backward compatible)
- Core tools are always registered regardless of this field
- Attempting to enable a tool name that doesn't exist returns an error
- When new optional tools are added to codebox-core, they are registered in a tool registry with their classification. `create_agent()` checks `optional_tools` against this registry.

#### Sandbox Configuration

The `sandbox_config` object controls agent runtime behavior:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `timeout` | int | 120 | Shell command execution timeout in seconds. Affects `LocalShellBackend`. Longer timeouts for tasks that run test suites or builds. |
| `recursion_limit` | int | 150 | Max agent loop iterations before forced stop. Prevents runaway agents. Higher values for complex multi-step tasks. |
| `temperature` | float | 0.0 | LLM sampling temperature. 0 = deterministic. Higher values for creative tasks. |

**For GitHub tasks, the orchestrator might use:**

```python
client.create_session(
    system_prompt=github_prompt,
    optional_tools=["create_pr", "request_human_feedback"],
    sandbox_config={
        "timeout": 300,           # 5 min — repo builds can be slow
        "recursion_limit": 200,   # more room for complex tasks
        "temperature": 0,         # deterministic for code changes
    },
)
```

### 15.2 Custom Environment Variables per Container

**Current state:** `docker_service.spawn()` only passes `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` to containers.

**Required:** The orchestrator must support injecting arbitrary environment variables per container, so that GitHub-specific values (`GH_TOKEN`, `CODEBOX_BRANCH`, etc.) can be set.

```python
# docker_service.spawn() — proposed signature change
def spawn(
    self,
    task_id: str,
    workspace_dir: str,
    env: dict[str, str] | None = None,  # NEW: additional env vars
) -> ContainerInfo:
```

The orchestrator merges the standard env vars (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`) with any task-specific env vars before passing to `containers.run()`.

**For GitHub tasks, the orchestrator injects:**

```python
env = {
    "GH_TOKEN": installation_token,
    "CODEBOX_GITHUB_REPO": "owner/repo",
    "CODEBOX_GITHUB_REF": "main",
    "CODEBOX_BRANCH": "codebox/42-fix-login-bug",
    "CODEBOX_GITHUB_ISSUE_NUMBER": "42",
}
```

### 15.3 Pre-Start Setup Commands

**Current state:** The orchestrator spawns a container, waits for it to be healthy, then creates a session and sends the prompt. There's no mechanism to run setup commands between "container is healthy" and "agent starts working."

**Required:** The orchestrator needs a setup phase where it can execute commands inside the sandbox before creating the agent session. For GitHub tasks, this includes:

```
Container healthy
  │
  ├── git clone https://github.com/{owner}/{repo} /workspace   # clone into workspace
  ├── cd /workspace && git checkout -b codebox/42-fix-login     # create branch
  ├── Write .git/hooks/pre-push (branch safety)                 # install hook
  ├── Write .git/info/exclude (hide .codebox/)                  # git exclude
  ├── mkdir .codebox && write task.json, context.md             # metadata
  │
  └── Create session + send prompt (existing flow)
```

**Implementation:** Use `docker exec` (via Docker SDK's `container.exec_run()`) to run setup commands. The orchestrator already uses this pattern to read the daemon token (`cat /run/daemon-token`). The setup commands should be a configurable list per task, not hardcoded.

```python
# task_service._do_run_task() — proposed addition
setup_commands: list[str] = []

if task.github_repo:
    setup_commands = [
        f"git clone https://x-access-token:{token}@github.com/{repo} /workspace",
        f"cd /workspace && git checkout -b {branch}",
        "cat > /workspace/.git/hooks/pre-push << 'HOOK'\n#!/bin/bash\n...\nHOOK",
        "chmod +x /workspace/.git/hooks/pre-push",
        "echo '.codebox/' >> /workspace/.git/info/exclude",
        "mkdir -p /workspace/.codebox",
    ]

for cmd in setup_commands:
    container.exec_run(["bash", "-c", cmd])
```

### 15.4 Session Configuration Pass-Through (Orchestrator → codebox-core)

**Current state:** The orchestrator's `sandbox_client.create_session()` passes `model`, `api_key`, `system_prompt`, and `working_dir`. Tool configuration and sandbox config are not passed through.

**Required:** Extend the session creation call to forward all three configuration pillars:

```python
# sandbox_client.create_session() — proposed change
def create_session(
    self,
    model: str | None = None,
    api_key: str | None = None,
    system_prompt: str | None = None,          # Pillar 1: already supported
    working_dir: str = "/workspace",
    optional_tools: list[str] | None = None,   # NEW (Pillar 3)
    sandbox_config: dict | None = None,        # NEW (Pillar 3)
) -> dict[str, Any]:
```

Note: Pillar 2 (environment variables) is handled at the container level via `docker_service.spawn()`, not at the session level.

### 15.5 Summary of Changes by Component

| Component | Change | Priority |
|-----------|--------|----------|
| **codebox-core** | Add `optional_tools` and `sandbox_config` to `CreateSessionRequest` | High |
| **codebox-core** | Implement core/optional tool registry and filtering in `create_agent()` | High |
| **codebox-core** | Make timeout, recursion_limit, temperature configurable from session request | High |
| **codebox-orchestrator** | Add custom env vars to `docker_service.spawn()` | High |
| **codebox-orchestrator** | Add pre-start setup command execution | High |
| **codebox-orchestrator** | Pass `optional_tools` and `sandbox_config` through to codebox-core | Medium |
| **codebox-sandbox** | Install `gh` CLI in sandbox image | Medium |

---

## 16. Implementation Phases

### Phase 1: Platform Prerequisites + Core Integration

**Platform changes (prerequisite):**
- codebox-core: core/optional tool registry and `optional_tools` session parameter
- codebox-core: configurable `sandbox_config` (timeout, recursion_limit, temperature)
- codebox-orchestrator: custom env vars in `docker_service.spawn()`
- codebox-orchestrator: pre-start setup command execution via `docker exec`
- codebox-orchestrator: pass `optional_tools` and `sandbox_config` through to codebox-core
- codebox-sandbox: install `gh` CLI in sandbox image

**GitHub integration:**
- GitHub App registration and installation flow
- Webhook receiver with signature verification
- Installation callback endpoint + manual installation fallback
- Installation token management
- Web UI: Settings > GitHub page (connect, list installations)
- Repo cloning and `codebox/*` branch creation by orchestrator
- `GH_TOKEN` credential injection (git + gh CLI auth)
- Pre-push hook injection for branch safety
- Task creation from `issue_comment` events
- Basic result commenting on issues

### Phase 2: PR Workflow

- PR creation from sandboxes via `gh pr create`
- PR review comment follow-up (`@codebox` on review comments)
- Commit status reporting
- `Closes #N` auto-linking
- Commit conventions (co-author, trigger link)

### Phase 3: Feedback Loop

- `request_human_feedback` routed to GitHub comments
- Immediate feedback delivery via webhook → WebSocket
- Delayed feedback with sandbox stop/resume
- Feedback timeout handling

### Phase 4: Controls and Polish

- Org/repo/user allowlists
- Rate limiting and concurrency controls
- Resource limits and timeout enforcement
- Web UI views for GitHub-triggered tasks (repo filter, issue links)
- Deduplication and loop prevention
- Documentation: recommended GitHub ruleset configuration for branch protection

### Phase 5: Enhanced Context

- Smart context extraction (referenced issues, repo conventions)
- `.codebox.toml` integration for repo-specific setup
- Cached sandbox images per repo (see TODO.md Section 6)
- Conversation history threading across multiple task sessions

---

## 17. Local Development: Testing the GitHub App

GitHub Apps require a publicly reachable URL to deliver webhooks. During local development, use a webhook proxy to forward events to your local orchestrator.

### Recommended: smee.io

[smee.io](https://smee.io) is GitHub's own webhook proxy service, purpose-built for GitHub App development. Unlike generic tunnels, smee buffers webhook deliveries so events are not lost if your local server is temporarily down (e.g. during a restart).

#### Setup

1. **Create a smee channel:** Visit https://smee.io and click "Start a new channel." Copy the channel URL (e.g. `https://smee.io/AbCdEfGhIjKl`).

2. **Install the smee client:**

   ```bash
   npm install -g smee-client
   ```

3. **Run the proxy:**

   ```bash
   smee --url https://smee.io/YOUR_CHANNEL --target http://localhost:8080/api/github/webhook
   ```

   This forwards all webhook deliveries from your smee channel to the local orchestrator.

4. **Configure your GitHub App:**

   - **Webhook URL**: `https://smee.io/YOUR_CHANNEL`
   - **Setup URL** (installation callback): Use ngrok or similar for the callback redirect (see below), or use the manual installation ID fallback (Section 4).

#### Handling the Installation Callback

smee.io only proxies webhook POST requests. The GitHub App installation callback (Section 4) is a browser redirect (GET request), so it needs a full tunnel:

```bash
# Option A: Use ngrok for the callback URL only
ngrok http 8080
# Set the GitHub App "Setup URL" to: https://<ngrok-id>.ngrok-free.app/api/github/callback

# Option B: Skip the callback entirely
# Use the manual installation ID input on the Settings > GitHub page (Section 4)
# This avoids needing a tunnel for the callback redirect
```

For most development work, **Option B** (manual installation ID) is simpler. You only need the full callback flow when testing the installation UX itself.

### Alternative: ngrok

ngrok exposes your local server as a full HTTPS endpoint, handling both webhooks and the installation callback redirect:

```bash
ngrok http 8080
# Webhook URL: https://<id>.ngrok-free.app/api/github/webhook
# Setup URL:   https://<id>.ngrok-free.app/api/github/callback
```

Downsides compared to smee:
- Free tier URLs change on each restart (requires updating GitHub App settings)
- No webhook buffering — events sent while your server is down are lost
- Requires account signup

### Recommended Practice: Separate Dev App

Register a **separate GitHub App** for development (e.g. `codebox-dev`) so that tunnel URLs and test configurations do not interfere with any production app. The dev app should:

- Point webhook and callback URLs at your tunnel/smee channel
- Be installed on a test repository (not production repos)
- Use a separate webhook secret and private key

This keeps production credentials and configuration completely isolated from development.
