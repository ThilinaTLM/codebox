"""GitHub Action handler: read issue comment, run agent, post results."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import subprocess
from pathlib import Path
from typing import Any

from codebox_agent.agent_runner import run_agent_stream
from codebox_agent.config import AgentConfig
from codebox_agent.sessions import SessionManager
from codebox_github_action.prompts import GITHUB_ACTIONS_ENVIRONMENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Logging mode helpers
# ---------------------------------------------------------------------------


def _human_print(msg: str) -> None:
    """Print a clean message to stdout for GitHub Actions logs."""
    print(msg, flush=True)  # noqa: T201


def _send_human(kind: str, msg: dict[str, Any]) -> None:
    """Emit clean, human-readable output using GitHub Actions annotations."""
    payload = msg.get("payload", {}) or {}

    if kind == "tool_call.started":
        name = payload.get("name", "?")
        _human_print(f"::group::Tool: {name}")
    elif kind in {"tool_call.completed", "tool_call.failed"}:
        output = str(payload.get("output", ""))
        if output:
            preview = output[:500]
            if len(output) > 500:
                preview += f"\n... ({len(output)} chars total)"
            _human_print(preview)
        _human_print("::endgroup::")
    elif kind == "reasoning.started":
        _human_print("\n--- LLM thinking ---")
    elif kind == "message.completed" and payload.get("role") == "assistant":
        content = str(payload.get("content", ""))
        if content:
            preview = content[:800]
            if len(content) > 800:
                preview += "..."
            _human_print(f"\n{preview}")
    elif kind == "outcome.declared":
        status = payload.get("status", "")
        status_msg = payload.get("message", "")
        line = f"::notice::Agent status: {status}"
        if status_msg:
            line += f" — {status_msg}"
        _human_print(line)
    elif kind == "run.failed":
        _human_print(f"::error::Agent error: {payload.get('error', 'unknown error')}")
    elif kind == "run.completed":
        _human_print("\nAgent finished.")


def _send_debug(kind: str, msg: dict[str, Any]) -> None:
    """Emit verbose technical output via Python logging."""
    payload = msg.get("payload", {}) or {}
    if kind == "tool_call.started":
        logger.info("Tool: %s", payload.get("name", "?"))
    elif kind in {"tool_call.completed", "tool_call.failed"}:
        output = str(payload.get("output", ""))
        preview = output[:300].replace("\n", " ") if output else "(empty)"
        if len(output) > 300:
            preview += "..."
        logger.info("Tool done: %s | %s", payload.get("name", "?"), preview)
    elif kind == "message.completed" and payload.get("role") == "assistant":
        content = str(payload.get("content", ""))
        preview = content[:300].replace("\n", " ") if content else ""
        if len(content) > 300:
            preview += "..."
        logger.info("Assistant: %s", preview)
    elif kind == "reasoning.started":
        logger.info("LLM invocation started")
    elif kind == "run.completed":
        logger.info("Agent done (output: %d chars)", len(str(payload.get("summary", ""))))
    elif kind == "outcome.declared":
        logger.info(
            "Agent status: %s — %s",
            payload.get("status", ""),
            payload.get("message", ""),
        )
    elif kind == "run.failed":
        logger.error("Agent error: %s", payload.get("error", ""))


def _gh(*args: str, stdin_input: str | None = None) -> str:
    """Run a gh CLI command and return stdout."""
    result = subprocess.run(  # noqa: S603
        ["gh", *args],  # noqa: S607
        capture_output=True,
        text=True,
        input=stdin_input,
        check=False,
    )
    if result.returncode != 0:
        logger.warning("gh %s failed: %s", " ".join(args), result.stderr)
    return result.stdout.strip()


def _parse_event() -> dict[str, Any]:
    """Parse the GitHub Actions event payload."""
    event_path = os.environ.get("GITHUB_EVENT_PATH", "")
    if not event_path or not Path(event_path).exists():
        raise RuntimeError("GITHUB_EVENT_PATH not set or file not found")
    return json.loads(Path(event_path).read_text())


def _truncate(text: str, *, max_chars: int = 8000) -> str:
    """Truncate text to *max_chars*, appending a notice if truncated."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n[... content truncated ...]"


def _fetch_comments(
    repo: str, issue_number: int, *, max_comments: int = 15
) -> list[dict[str, str]]:
    """Fetch recent comments, limited to reduce prompt injection surface."""
    raw = _gh("api", f"repos/{repo}/issues/{issue_number}/comments", "--paginate")
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return []
    return [
        {
            "user": c.get("user", {}).get("login", "unknown"),
            "body": c.get("body", ""),
            "created_at": c.get("created_at", ""),
        }
        for c in data[-max_comments:]
    ]


def _fetch_pr_files(repo: str, pr_number: int) -> list[str]:
    """Fetch changed files for a PR via gh CLI."""
    try:
        data = json.loads(_gh("api", f"repos/{repo}/pulls/{pr_number}/files", "--paginate"))
    except (json.JSONDecodeError, ValueError):
        return []
    status_map = {"added": "A", "modified": "M", "removed": "D", "renamed": "R", "copied": "C"}
    lines = []
    for f in data[:50]:
        status = status_map.get(f.get("status", ""), "?")
        filename = f.get("filename", "")
        adds = f.get("additions", 0)
        dels = f.get("deletions", 0)
        lines.append(f"{status} {filename} (+{adds}, -{dels})")
    if len(data) > 50:
        lines.append(f"... and {len(data) - 50} more files")
    return lines


def _fetch_guidelines(repo: str) -> str:
    """Fetch CLAUDE.md and CONTRIBUTING.md from the repo if they exist."""
    parts = []
    for filename in ("CLAUDE.md", "CONTRIBUTING.md"):
        content = _gh(
            "api",
            f"repos/{repo}/contents/{filename}",
            "-H",
            "Accept: application/vnd.github.raw+json",
        )
        if content:
            truncated = content[:2000]
            parts.append(f"### {filename}\n{truncated}")
    return "\n\n".join(parts)


def _agent_already_created_pr(repo: str, issue_number: int) -> bool:
    """Check whether a PR linked to this issue was already created during this run."""
    if not repo or not issue_number:
        return False
    # Look for open PRs that mention this issue number in the body
    raw = _gh(
        "pr",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--search",
        f"#{issue_number}",
        "--json",
        "number",
        "--limit",
        "5",
    )
    if not raw:
        return False
    try:
        prs = json.loads(raw)
        return len(prs) > 0
    except (json.JSONDecodeError, ValueError):
        return False


def _check_author_permission(repo: str, author: str) -> bool:
    """Check if the comment author has write access to the repo."""
    try:
        result = _gh(
            "api",
            f"repos/{repo}/collaborators/{author}/permission",
            "--jq",
            ".permission",
        )
    except Exception:
        return False
    else:
        permission = result.strip()
        return permission in ("admin", "write", "maintain")


async def _validate_agent_output(workspace: str) -> list[str]:
    """Check for suspicious agent output patterns."""
    warnings: list[str] = []

    proc = await asyncio.create_subprocess_exec(
        "git",
        "diff",
        "--name-only",
        "--diff-filter=ACMRD",
        cwd=workspace,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    changed_files = stdout.decode().strip().split("\n") if stdout and stdout.strip() else []

    sensitive_patterns = [".github/workflows/", ".env", "Dockerfile", "action.yml"]
    warnings.extend(
        f"Agent modified sensitive file: {f}"
        for f in changed_files
        for pattern in sensitive_patterns
        if pattern in f
    )

    return warnings


def _build_context_section(issue: dict[str, Any], repo: str, is_pr: bool) -> list[str]:
    """Build the <context> metadata block."""
    issue_number = issue.get("number", 0)
    lines: list[str] = [
        "<context>",
        f"Repository: {repo}",
        f"Type: {'Pull Request' if is_pr else 'Issue'}",
        f"Number: #{issue_number}",
        f"Title: {issue.get('title', '')}",
    ]
    labels = [lbl.get("name", "") for lbl in issue.get("labels", []) if lbl.get("name")]
    if labels:
        lines.append(f"Labels: {', '.join(labels)}")
    lines.append("</context>")
    return lines


def _build_conversation_section(repo: str, issue_number: int) -> list[str]:
    """Build the <conversation> block from issue comments."""
    if not repo or not issue_number:
        return []
    comments = _fetch_comments(repo, issue_number)
    if not comments:
        return []
    lines: list[str] = ["", "<conversation>"]
    for c in comments:
        lines.append(f'<comment author="{c["user"]}" date="{c["created_at"]}">')
        lines.append(_truncate(c["body"], max_chars=4000))
        lines.append("</comment>")
    lines.append("</conversation>")
    return lines


def _build_agent_prompt(event: dict[str, Any]) -> str:
    """Build the prompt for the agent from the issue and comment.

    Uses XML-tagged sections so the LLM can distinguish trusted
    instructions from user-supplied (untrusted) content.
    """
    issue = event.get("issue", {})
    comment = event.get("comment", {})
    repo = os.environ.get("GITHUB_REPOSITORY", "")

    issue_number = issue.get("number", 0)
    issue_body = issue.get("body", "") or ""
    comment_body = comment.get("body", "") or ""
    is_pr = "pull_request" in issue

    trigger = os.environ.get("CODEBOX_TRIGGER_KEYWORD", "/codebox")
    task = comment_body.replace(trigger, "").strip()

    parts: list[str] = _build_context_section(issue, repo, is_pr)

    if issue_body:
        parts += [
            "",
            "<issue_description>",
            _truncate(issue_body, max_chars=8000),
            "</issue_description>",
        ]

    parts += _build_conversation_section(repo, issue_number)

    if is_pr and repo and issue_number:
        pr_files = _fetch_pr_files(repo, issue_number)
        if pr_files:
            parts += ["", "<pr_changed_files>", "\n".join(pr_files[:100]), "</pr_changed_files>"]

    if repo:
        guidelines = _fetch_guidelines(repo)
        if guidelines:
            parts += [
                "",
                "<repository_guidelines>",
                _truncate(guidelines, max_chars=4000),
                "</repository_guidelines>",
            ]

    if task:
        parts += ["", "<task>", _truncate(task, max_chars=4000), "</task>"]

    return "\n".join(parts)


async def run() -> None:  # noqa: PLR0912, PLR0915
    """Main entry point for the GitHub Action."""
    # Parse event
    event = _parse_event()
    comment = event.get("comment", {})
    issue = event.get("issue", {})

    trigger = os.environ.get("CODEBOX_TRIGGER_KEYWORD", "/codebox")
    comment_body = comment.get("body", "") or ""

    if trigger not in comment_body:
        logger.info("Comment does not contain trigger keyword '%s', skipping", trigger)
        return

    # Verify the comment author has write access to the repo
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    comment_author = comment.get("user", {}).get("login", "")
    if repo and comment_author and not _check_author_permission(repo, comment_author):
        _human_print(
            f"::warning::Ignoring trigger from {comment_author} (insufficient permissions)"
        )
        return

    issue_number = issue.get("number")
    issue_title = issue.get("title", f"Issue #{issue_number}")
    is_pr = "pull_request" in issue
    log_mode = os.environ.get("CODEBOX_LOG_MODE", "human").lower()
    human_mode = log_mode != "debug"
    logger.info("Triggered on %s#%s", repo, issue_number)

    # Generate unique branch name for this run
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    branch_suffix = f"run{run_id}" if run_id else secrets.token_hex(4)
    branch_name = f"codebox/issue-{issue_number}-{branch_suffix}"

    # React to the comment to acknowledge
    comment_id = comment.get("id")
    if comment_id and repo:
        _gh("api", f"repos/{repo}/issues/comments/{comment_id}/reactions", "-f", "content=eyes")

    # Post a greeting comment
    if issue_number:
        entity = "PR" if is_pr else "issue"
        greeting = (
            f"Hey! 👋 I'm picking up this {entity} now.\n\n"
            f"**Working on:** {issue_title}\n\n"
            f"I'll push any changes to branch `{branch_name}`.\n\n"
            f"Sit tight — I'll report back when I'm done."
        )
        _gh("issue", "comment", str(issue_number), "--body", greeting)

    # Set up the agent
    workspace = os.environ.get("GITHUB_WORKSPACE", str(Path.cwd()))

    # Build config from the same env vars that already exist.
    # AgentConfig.from_env() already defaults recursion_limit to 999 when
    # CODEBOX_AGENT_RECURSION_LIMIT is unset; callers can still override it.
    agent_config = AgentConfig.from_env()

    system_prompt = os.environ.get("CODEBOX_AGENT_SYSTEM_PROMPT")
    if system_prompt:
        agent_config = agent_config.model_copy(update={"system_prompt": system_prompt})

    manager = SessionManager(checkpoint_db_path="/tmp/codebox-checkpoints.db")  # noqa: S108
    session = await manager.create_from_config(
        config=agent_config,
        environment_system_prompt=GITHUB_ACTIONS_ENVIRONMENT_SYSTEM_PROMPT,
        working_dir=workspace,
    )

    # Set up event collection
    events: list[dict[str, Any]] = []
    final_text = ""
    agent_status = ""
    agent_status_message = ""

    async def send(msg: dict[str, Any]) -> None:
        nonlocal final_text, agent_status, agent_status_message
        events.append(msg)
        kind = msg.get("kind", "")

        if human_mode:
            _send_human(kind, msg)
        else:
            _send_debug(kind, msg)

        payload = msg.get("payload", {}) or {}
        if kind == "run.completed":
            final_text = str(payload.get("summary", ""))
        elif kind == "outcome.declared":
            agent_status = str(payload.get("status", ""))
            agent_status_message = str(payload.get("message", ""))

    # Run the agent
    prompt = _build_agent_prompt(event)
    logger.info("Running agent with prompt (len=%d)", len(prompt))

    await run_agent_stream(send, session.session_id, manager, new_message=prompt)

    # Close the checkpoint DB so aiosqlite shuts down before the event loop closes
    await session.checkpointer.conn.close()

    # Validate agent output for suspicious modifications
    output_warnings = await _validate_agent_output(workspace)
    for w in output_warnings:
        logger.warning(w)
        _human_print(f"::warning::{w}")

    # Build result comment
    result_parts = []

    if final_text:
        result_parts.append(final_text)

    if agent_status:
        result_parts.append(f"\n\n**Status:** `{agent_status}`")
        if agent_status_message:
            result_parts.append(f" — {agent_status_message}")

    result_body = "".join(result_parts) or "Agent completed without output."

    # Post result as comment
    if issue_number:
        _gh("issue", "comment", str(issue_number), "--body", result_body)

    # Check if the agent made changes and create a PR (fallback — the agent
    # may have already committed, pushed, and opened a PR itself).
    git_status_proc = await asyncio.create_subprocess_exec(
        "git",
        "status",
        "--porcelain",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=workspace,
    )
    git_stdout, _ = await git_status_proc.communicate()
    if git_stdout.decode().strip():
        logger.info("Agent left uncommitted changes, creating PR")

        for git_cmd in [
            ["git", "checkout", "-b", branch_name],
            ["git", "add", "-A"],
            ["git", "commit", "-m", f"codebox: address issue #{issue_number}"],
            ["git", "push", "-u", "--force", "origin", branch_name],
        ]:
            proc = await asyncio.create_subprocess_exec(*git_cmd, cwd=workspace)
            await proc.communicate()
            if proc.returncode != 0:
                msg = f"Command failed: {' '.join(git_cmd)}"
                raise RuntimeError(msg)

        pr_body = (
            f"Automated changes by codebox agent for #{issue_number}.\n\n"
            f"{final_text[:2000] if final_text else 'See issue for details.'}"
        )
        if output_warnings:
            warnings_text = "\n".join(f"- ⚠️ {w}" for w in output_warnings)
            pr_body += f"\n\n### Security Review Notes\n{warnings_text}"
        pr_url = _gh(
            "pr",
            "create",
            "--title",
            f"Fix: {issue_title}",
            "--body",
            pr_body,
            "--head",
            branch_name,
        )
        logger.info("PR created on branch %s: %s", branch_name, pr_url)

        if issue_number:
            done_comment = (
                f"All done! I've opened a pull request with my changes: {pr_url}\n\n"
                f"Please review when you get a chance. 🚀"
            )
            _gh("issue", "comment", str(issue_number), "--body", done_comment)
    else:
        # No uncommitted changes — check whether the agent already created a
        # PR (it may have committed & pushed on its own).  Only post the
        # "no changes" comment when there is genuinely nothing to show.
        agent_created_pr = _agent_already_created_pr(repo, issue_number)
        if agent_created_pr:
            logger.info("Agent already created a PR, skipping post-run comment")
        else:
            logger.info("No file changes detected, skipping PR creation")
            if issue_number:
                done_comment = (
                    "I've finished looking into this but didn't end up making"
                    " any file changes.\n\n"
                    "Check my earlier comment for details on what I found."
                )
                _gh("issue", "comment", str(issue_number), "--body", done_comment)
