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

from codebox_github_action.prompts import GITHUB_ACTIONS_ENVIRONMENT_PROMPT

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


def _build_agent_prompt(event: dict[str, Any]) -> str:
    """Build the prompt for the agent from the issue and comment."""
    issue = event.get("issue", {})
    comment = event.get("comment", {})

    issue_title = issue.get("title", "")
    issue_body = issue.get("body", "") or ""
    comment_body = comment.get("body", "") or ""

    # Strip the trigger keyword from the comment
    trigger = os.environ.get("TRIGGER_KEYWORD", "/codebox")
    task = comment_body.replace(trigger, "").strip()

    parts = [f"# Issue: {issue_title}"]
    if issue_body:
        parts.append(f"\n{issue_body}")
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
    model = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-4")
    api_key = os.environ.get("OPENROUTER_API_KEY", "")

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required")

    manager = SessionManager(checkpoint_db_path="/tmp/codebox-checkpoints.db")
    session = await manager.create(
        model=model,
        api_key=api_key,
        environment_prompt=GITHUB_ACTIONS_ENVIRONMENT_PROMPT,
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

        if msg_type == "done":
            final_text = msg.get("content", "")
        elif msg_type == "task_outcome":
            agent_status = msg.get("status", "")
            agent_status_message = msg.get("message", "")
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
