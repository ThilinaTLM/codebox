"""CLI entry-point for Codebox."""

from __future__ import annotations

import asyncio
import sys

import click
from rich.console import Console
from rich.table import Table

from codebox_cli.config import ORCHESTRATOR_URL
from codebox_cli.orchestrator_client import OrchestratorClient
from codebox_cli.orchestrator_chat import orchestrator_chat_loop


@click.group()
def cli() -> None:
    """Codebox — manage and connect to sandboxed coding agents."""


# ── Orchestrator task commands ────────────────────────────────


@cli.group(name="task")
@click.option(
    "--url",
    default=None,
    envvar="CODEBOX_ORCHESTRATOR_URL",
    help="Orchestrator URL (default: $CODEBOX_ORCHESTRATOR_URL or http://localhost:8080).",
)
@click.pass_context
def task_group(ctx: click.Context, url: str | None) -> None:
    """Manage tasks via the orchestrator."""
    ctx.ensure_object(dict)
    ctx.obj["orch"] = OrchestratorClient(base_url=url or ORCHESTRATOR_URL)


@task_group.command(name="create")
@click.option("--title", "-t", required=True, help="Task title.")
@click.option("--prompt", "-p", required=True, help="Task prompt.")
@click.option("--model", "-m", default=None, help="Override LLM model.")
@click.option("--system-prompt", default=None, help="Custom system prompt.")
@click.option("--watch", is_flag=True, default=True, help="Stream task output (default: true).")
@click.option("--no-watch", is_flag=True, help="Don't stream task output.")
@click.pass_context
def task_create(
    ctx: click.Context,
    title: str,
    prompt: str,
    model: str | None,
    system_prompt: str | None,
    watch: bool,
    no_watch: bool,
) -> None:
    """Create a new task and optionally stream its output."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        task = orch.create_task(
            title=title,
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
        )
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    click.echo(f"Task created: {task['id']} ({task['title']})")

    if not no_watch:
        asyncio.run(orchestrator_chat_loop(orch, task["id"], watch_only=True))


@task_group.command(name="list")
@click.option("--status", "-s", default=None, help="Filter by status.")
@click.pass_context
def task_list(ctx: click.Context, status: str | None) -> None:
    """List tasks from the orchestrator."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        tasks = orch.list_tasks(status=status)
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    if not tasks:
        click.echo("No tasks found.")
        return

    table = Table()
    table.add_column("ID", style="dim", max_width=10)
    table.add_column("Title")
    table.add_column("Status")
    table.add_column("Model", style="dim")

    for t in tasks:
        table.add_row(
            t["id"][:8],
            t["title"],
            t["status"],
            t.get("model", ""),
        )

    Console().print(table)


@task_group.command(name="connect")
@click.argument("task_id")
@click.pass_context
def task_connect(ctx: click.Context, task_id: str) -> None:
    """Connect to a running task for interactive follow-up."""
    orch: OrchestratorClient = ctx.obj["orch"]
    asyncio.run(orchestrator_chat_loop(orch, task_id))


@task_group.command(name="cancel")
@click.argument("task_id")
@click.pass_context
def task_cancel(ctx: click.Context, task_id: str) -> None:
    """Cancel a running task."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        task = orch.cancel_task(task_id)
        click.echo(f"Task {task_id[:8]} cancelled (status: {task['status']})")
    except RuntimeError as exc:
        raise click.ClickException(str(exc))


@task_group.command(name="delete")
@click.argument("task_id")
@click.pass_context
def task_delete(ctx: click.Context, task_id: str) -> None:
    """Delete a task and its container."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        orch.delete_task(task_id)
        click.echo(f"Task {task_id[:8]} deleted.")
    except RuntimeError as exc:
        raise click.ClickException(str(exc))
