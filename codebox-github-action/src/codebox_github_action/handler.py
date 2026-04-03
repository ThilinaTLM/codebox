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
from codebox_agent.sessions import SessionManager
from codebox_github_action.prompts import GITHUB_ACTIONS_ENVIRONMENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Logging mode helpers
# ---------------------------------------------------------------------------


def _human_print(msg: str) -> None:
    """Print a clean message to stdout for GitHub Actions logs."""
    print(msg, flush=True)  # noqa: T201


def _send_human(msg_type: str, msg: dict[str, Any]) -> None:  # noqa: PLR0912, PLR0915
    """Emit clean, human-readable output using GitHub Actions annotations."""
    if msg_type == "tool_start":
        name = msg.get("name", "?")
        tool_input = msg.get("input", "")
        summary = ""
        if tool_input:
            try:
                parsed = json.loads(tool_input)
                if isinstance(parsed, dict):
                    key = (
                        parsed.get("path")
                        or parsed.get("file_path")
                        or parsed.get("command")
                        or parsed.get("pattern")
                        or parsed.get("query")
                        or ""
                    )
                    if key:
                        if len(str(key)) > 120:
                            key = str(key)[:120] + "..."
                        summary = f": {key}"
            except (json.JSONDecodeError, TypeError):
                pass
        _human_print(f"::group::Tool: {name}{summary}")

    elif msg_type == "tool_end":
        output = msg.get("output", "")
        if output:
            preview = output[:500]
            if len(output) > 500:
                preview += f"\n... ({len(output)} chars total)"
            _human_print(preview)
        _human_print("::endgroup::")

    elif msg_type == "model_start":
        _human_print("\n--- LLM thinking ---")

    elif msg_type == "message_complete":
        message = msg.get("message", {})
        role = message.get("role", "")
        content = message.get("content", "")
        tool_calls = message.get("tool_calls", [])
        if role == "assistant":
            if content:
                preview = content[:800]
                if len(content) > 800:
                    preview += "..."
                _human_print(f"\n{preview}")
            if tool_calls:
                calls = ", ".join(tc.get("name", "?") for tc in tool_calls)
                _human_print(f"  -> calling: {calls}")

    elif msg_type == "task_outcome":
        status = msg.get("status", "")
        status_msg = msg.get("message", "")
        line = f"::notice::Agent status: {status}"
        if status_msg:
            line += f" — {status_msg}"
        _human_print(line)

    elif msg_type == "error":
        _human_print(f"::error::Agent error: {msg.get('detail', 'unknown error')}")

    elif msg_type == "done":
        _human_print("\nAgent finished.")


def _send_debug(msg_type: str, msg: dict[str, Any]) -> None:  # noqa: PLR0912
    """Emit verbose technical output via Python logging (original behavior)."""
    if msg_type == "tool_start":
        name = msg.get("name", "?")
        tool_input = msg.get("input", "")
        if len(tool_input) > 500:
            tool_input = tool_input[:500] + "..."
        logger.info("Tool: %s | input: %s", name, tool_input or "(none)")

    elif msg_type == "tool_end":
        name = msg.get("name", "?")
        output = msg.get("output", "")
        output_len = len(output)
        preview = output[:300].replace("\n", " ") if output else "(empty)"
        if output_len > 300:
            preview += "..."
        logger.info("Tool done: %s | output (%d chars): %s", name, output_len, preview)

    elif msg_type == "message_complete":
        message = msg.get("message", {})
        role = message.get("role", "?")
        content = message.get("content", "")
        tool_calls = message.get("tool_calls", [])
        if role == "assistant":
            if content:
                preview = content[:300].replace("\n", " ")
                if len(content) > 300:
                    preview += "..."
                logger.info("Assistant: %s", preview)
            if tool_calls:
                for tc in tool_calls:
                    tc_name = tc.get("name", "?")
                    tc_args = tc.get("args_json", "")
                    if len(tc_args) > 500:
                        tc_args = tc_args[:500] + "..."
                    logger.info("  -> tool_call: %s(%s)", tc_name, tc_args)
        elif role == "tool":
            tool_name = message.get("tool_name", "?")
            preview = content[:200].replace("\n", " ") if content else "(empty)"
            if len(content) > 200:
                preview += "..."
            logger.info("Tool result [%s]: %s", tool_name, preview)

    elif msg_type == "model_start":
        logger.info("LLM invocation started")

    elif msg_type == "done":
        logger.info("Agent done (output: %d chars)", len(msg.get("content", "")))

    elif msg_type == "task_outcome":
        logger.info("Agent status: %s — %s", msg.get("status", ""), msg.get("message", ""))

    elif msg_type == "error":
        logger.error("Agent error: %s", msg.get("detail", ""))


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


def _fetch_comments(repo: str, issue_number: int) -> list[dict[str, str]]:
    """Fetch comments on an issue or PR via gh CLI."""
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
        for c in data[-30:]  # Last 30 comments
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


def _build_agent_prompt(event: dict[str, Any]) -> str:
    """Build the prompt for the agent from the issue and comment."""
    issue = event.get("issue", {})
    comment = event.get("comment", {})
    repo = os.environ.get("GITHUB_REPOSITORY", "")

    issue_title = issue.get("title", "")
    issue_number = issue.get("number", 0)
    issue_body = issue.get("body", "") or ""
    comment_body = comment.get("body", "") or ""
    is_pr = "pull_request" in issue

    # Strip the trigger keyword from the comment
    trigger = os.environ.get("TRIGGER_KEYWORD", "/codebox")
    task = comment_body.replace(trigger, "").strip()

    parts = [f"# {'PR' if is_pr else 'Issue'}: {issue_title}"]

    # Labels
    labels = [label.get("name", "") for label in issue.get("labels", []) if label.get("name")]
    if labels:
        parts.append(f"\nLabels: {', '.join(labels)}")

    # Description
    if issue_body:
        parts.append(f"\n## Description\n\n{issue_body}")

    # Conversation (all prior comments)
    if repo and issue_number:
        comments = _fetch_comments(repo, issue_number)
        if comments:
            parts.append("\n## Conversation")
            parts.extend(f"\n**{c['user']}** ({c['created_at']}):\n{c['body']}" for c in comments)

    # PR changed files
    if is_pr and repo and issue_number:
        pr_files = _fetch_pr_files(repo, issue_number)
        if pr_files:
            parts.append("\n## PR Changed Files\n")
            parts.append("\n".join(pr_files))

    # Repository guidelines
    if repo:
        guidelines = _fetch_guidelines(repo)
        if guidelines:
            parts.append(f"\n## Repository Guidelines\n\n{guidelines}")

    # Instructions from the triggering comment
    if task:
        parts.append(f"\n## Instructions from comment\n\n{task}")

    return "\n".join(parts)


async def run() -> None:  # noqa: PLR0912, PLR0915
    """Main entry point for the GitHub Action."""
    # Parse event
    event = _parse_event()
    comment = event.get("comment", {})
    issue = event.get("issue", {})

    trigger = os.environ.get("TRIGGER_KEYWORD", "/codebox")
    comment_body = comment.get("body", "") or ""

    if trigger not in comment_body:
        logger.info("Comment does not contain trigger keyword '%s', skipping", trigger)
        return

    issue_number = issue.get("number")
    issue_title = issue.get("title", f"Issue #{issue_number}")
    is_pr = "pull_request" in issue
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    log_mode = os.environ.get("LOG_MODE", "human").lower()
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
    provider = os.environ.get("LLM_PROVIDER", "") or (
        "openrouter" if os.environ.get("OPENROUTER_MODEL", "") else "openai"
    )
    model = (
        os.environ.get("OPENROUTER_MODEL", "")
        if provider == "openrouter"
        else os.environ.get("OPENAI_MODEL", "")
    )
    if not model:
        raise RuntimeError("OPENROUTER_MODEL or OPENAI_MODEL is required")
    api_key = (
        os.environ.get("OPENROUTER_API_KEY", "")
        if provider == "openrouter"
        else os.environ.get("OPENAI_API_KEY", "")
    )
    base_url = os.environ.get("OPENAI_BASE_URL", "") if provider == "openai" else ""

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY or OPENAI_API_KEY is required")

    manager = SessionManager(checkpoint_db_path="/tmp/codebox-checkpoints.db")  # noqa: S108
    dynamic_system_prompt = os.environ.get("DYNAMIC_SYSTEM_PROMPT")
    session = await manager.create(
        provider=provider,
        model=model,
        api_key=api_key,
        base_url=base_url or None,
        environment_system_prompt=GITHUB_ACTIONS_ENVIRONMENT_SYSTEM_PROMPT,
        dynamic_system_prompt=dynamic_system_prompt,
        working_dir=workspace,
        sandbox_config={"recursion_limit": 300},
    )

    # Set up event collection
    events: list[dict[str, Any]] = []
    final_text = ""
    agent_status = ""
    agent_status_message = ""

    async def send(msg: dict[str, Any]) -> None:
        nonlocal final_text, agent_status, agent_status_message
        events.append(msg)
        msg_type = msg.get("type", "")

        # Dispatch to mode-specific formatter
        if human_mode:
            _send_human(msg_type, msg)
        else:
            _send_debug(msg_type, msg)

        # Always update state variables regardless of mode
        if msg_type == "done":
            final_text = msg.get("content", "")
        elif msg_type == "task_outcome":
            agent_status = msg.get("status", "")
            agent_status_message = msg.get("message", "")

    # Inject send_fn into status reporter
    session.status_reporter.send_fn = send

    # Run the agent
    prompt = _build_agent_prompt(event)
    logger.info("Running agent with prompt (len=%d)", len(prompt))

    await run_agent_stream(send, session.session_id, manager, new_message=prompt)

    # Close the checkpoint DB so aiosqlite shuts down before the event loop closes
    await session.checkpointer.conn.close()

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
