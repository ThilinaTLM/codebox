"""GitHub Action handler: read issue comment, run agent, post results."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any

from codebox_agent.agent_runner import SendFn, run_agent_stream
from codebox_agent.sessions import SessionManager
from codebox_agent.tools.status import StatusReporter

from codebox_github_action.prompts import GITHUB_ACTIONS_ENVIRONMENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


def _gh(*args: str, input: str | None = None) -> str:
    """Run a gh CLI command and return stdout."""
    result = subprocess.run(
        ["gh", *args],
        capture_output=True,
        text=True,
        input=input,
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
    comments = []
    for c in data[-30:]:  # Last 30 comments
        comments.append({
            "user": c.get("user", {}).get("login", "unknown"),
            "body": c.get("body", ""),
            "created_at": c.get("created_at", ""),
        })
    return comments


def _fetch_pr_files(repo: str, pr_number: int) -> list[str]:
    """Fetch changed files for a PR via gh CLI."""
    try:
        data = json.loads(
            _gh("api", f"repos/{repo}/pulls/{pr_number}/files", "--paginate")
        )
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
        content = _gh("api", f"repos/{repo}/contents/{filename}",
                       "-H", "Accept: application/vnd.github.raw+json")
        if content:
            truncated = content[:2000]
            parts.append(f"### {filename}\n{truncated}")
    return "\n\n".join(parts)


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
    labels = [l.get("name", "") for l in issue.get("labels", []) if l.get("name")]
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
            for c in comments:
                parts.append(f"\n**{c['user']}** ({c['created_at']}):\n{c['body']}")

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


async def run() -> None:
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
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    logger.info("Triggered on %s#%s", repo, issue_number)

    # React to the comment to acknowledge
    comment_id = comment.get("id")
    if comment_id and repo:
        _gh("api", f"repos/{repo}/issues/comments/{comment_id}/reactions",
             "-f", "content=eyes")

    # Post a "working on it" comment
    if issue_number:
        _gh("issue", "comment", str(issue_number),
             "--body", "Agent is working on this...")

    # Set up the agent
    workspace = os.environ.get("GITHUB_WORKSPACE", os.getcwd())
    model = os.environ.get("OPENROUTER_MODEL", "")
    if not model:
        raise RuntimeError("OPENROUTER_MODEL is required")
    api_key = os.environ.get("OPENROUTER_API_KEY", "")

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required")

    manager = SessionManager(checkpoint_db_path="/tmp/codebox-checkpoints.db")
    dynamic_system_prompt = os.environ.get("DYNAMIC_SYSTEM_PROMPT")
    session = await manager.create(
        model=model,
        api_key=api_key,
        environment_system_prompt=GITHUB_ACTIONS_ENVIRONMENT_SYSTEM_PROMPT,
        dynamic_system_prompt=dynamic_system_prompt,
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
        msg_type = msg.get("type", "")

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
            final_text = msg.get("content", "")
            logger.info("Agent done (output: %d chars)", len(final_text))

        elif msg_type == "task_outcome":
            agent_status = msg.get("status", "")
            agent_status_message = msg.get("message", "")
            logger.info("Agent status: %s — %s", agent_status, agent_status_message)

        elif msg_type == "error":
            logger.error("Agent error: %s", msg.get("detail", ""))

    # Inject send_fn into status reporter
    session.status_reporter.send_fn = send

    # Run the agent
    prompt = _build_agent_prompt(event)
    logger.info("Running agent with prompt (len=%d)", len(prompt))

    await run_agent_stream(send, session.session_id, manager, new_message=prompt)

    # Build result comment
    result_parts = []

    if final_text:
        result_parts.append(final_text)

    if agent_status:
        result_parts.append(f"\n\n**Status:** `{agent_status}`")
        if agent_status_message:
            result_parts.append(f" — {agent_status_message}")

    # Summarize tool usage
    tool_calls = [e for e in events if e.get("type") == "tool_start"]
    if tool_calls:
        tool_names = [tc.get("name", "unknown") for tc in tool_calls]
        result_parts.append(f"\n\n<details><summary>Tools used ({len(tool_calls)})</summary>\n\n")
        for name in tool_names:
            result_parts.append(f"- `{name}`\n")
        result_parts.append("\n</details>")

    result_body = "".join(result_parts) or "Agent completed without output."

    # Post result as comment
    if issue_number:
        _gh("issue", "comment", str(issue_number), "--body", result_body)

    # Check if the agent made changes and create a PR
    git_status = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True, text=True, cwd=workspace,
    )
    if git_status.stdout.strip():
        logger.info("Agent made file changes, creating PR")
        branch_name = f"codebox/issue-{issue_number}"

        subprocess.run(["git", "checkout", "-b", branch_name], cwd=workspace, check=True)
        subprocess.run(["git", "add", "-A"], cwd=workspace, check=True)
        subprocess.run(
            ["git", "commit", "-m", f"codebox: address issue #{issue_number}"],
            cwd=workspace, check=True,
        )
        subprocess.run(["git", "push", "-u", "origin", branch_name], cwd=workspace, check=True)

        issue_title = issue.get("title", f"Issue #{issue_number}")
        pr_body = f"Automated changes by codebox agent for #{issue_number}.\n\n{final_text[:2000] if final_text else 'See issue for details.'}"
        _gh("pr", "create",
             "--title", f"Fix: {issue_title}",
             "--body", pr_body,
             "--head", branch_name)

        logger.info("PR created on branch %s", branch_name)
    else:
        logger.info("No file changes detected, skipping PR creation")
