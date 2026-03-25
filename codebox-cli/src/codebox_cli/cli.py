"""CLI entry-point for Codebox."""

from __future__ import annotations

import asyncio

import click
from rich.console import Console
from rich.table import Table

from codebox_cli.config import ORCHESTRATOR_URL
from codebox_cli.orchestrator_client import OrchestratorClient
from codebox_cli.orchestrator_chat import orchestrator_chat_loop


@click.group()
def cli() -> None:
    """Codebox — manage and connect to sandboxed coding agents."""


# ── Box commands ────────────────────────────────────────────


@cli.group(name="box")
@click.option(
    "--url",
    default=None,
    envvar="CODEBOX_ORCHESTRATOR_URL",
    help="Orchestrator URL (default: $CODEBOX_ORCHESTRATOR_URL or http://localhost:8080).",
)
@click.pass_context
def box_group(ctx: click.Context, url: str | None) -> None:
    """Manage boxes via the orchestrator."""
    ctx.ensure_object(dict)
    ctx.obj["orch"] = OrchestratorClient(base_url=url or ORCHESTRATOR_URL)


@box_group.command(name="create")
@click.option("--name", "-n", default=None, help="Box name.")
@click.option("--prompt", "-p", default=None, help="Initial prompt (auto-executed on start).")
@click.option("--model", "-m", default=None, help="Override LLM model.")
@click.option("--system-prompt", default=None, help="Custom system prompt.")
@click.option("--watch", is_flag=True, default=True, help="Stream box output (default: true).")
@click.option("--no-watch", is_flag=True, help="Don't stream box output.")
@click.pass_context
def box_create(
    ctx: click.Context,
    name: str | None,
    prompt: str | None,
    model: str | None,
    system_prompt: str | None,
    watch: bool,
    no_watch: bool,
) -> None:
    """Create a new box and optionally stream its output."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        box = orch.create_box(
            name=name,
            initial_prompt=prompt,
            model=model,
            system_prompt=system_prompt,
        )
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    click.echo(f"Box created: {box['id']} ({box['name']})")

    if not no_watch:
        asyncio.run(orchestrator_chat_loop(orch, box["id"], watch_only=bool(prompt)))


@box_group.command(name="list")
@click.option("--status", "-s", default=None, help="Filter by status.")
@click.pass_context
def box_list(ctx: click.Context, status: str | None) -> None:
    """List boxes from the orchestrator."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        boxes = orch.list_boxes(status=status)
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    if not boxes:
        click.echo("No boxes found.")
        return

    table = Table()
    table.add_column("ID", style="dim", max_width=10)
    table.add_column("Name")
    table.add_column("Status")
    table.add_column("Model", style="dim")
    table.add_column("Trigger", style="dim")

    for b in boxes:
        table.add_row(
            b["id"][:8],
            b["name"],
            b["status"],
            b.get("model", ""),
            b.get("trigger", "") or "",
        )

    Console().print(table)


@box_group.command(name="connect")
@click.argument("box_id")
@click.pass_context
def box_connect(ctx: click.Context, box_id: str) -> None:
    """Connect to a box for interactive chat."""
    orch: OrchestratorClient = ctx.obj["orch"]
    asyncio.run(orchestrator_chat_loop(orch, box_id))


@box_group.command(name="stop")
@click.argument("box_id")
@click.pass_context
def box_stop(ctx: click.Context, box_id: str) -> None:
    """Stop a running box."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        box = orch.stop_box(box_id)
        click.echo(f"Box {box_id[:8]} stopped (status: {box['status']})")
    except RuntimeError as exc:
        raise click.ClickException(str(exc))


@box_group.command(name="delete")
@click.argument("box_id")
@click.pass_context
def box_delete(ctx: click.Context, box_id: str) -> None:
    """Delete a box and its container."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        orch.delete_box(box_id)
        click.echo(f"Box {box_id[:8]} deleted.")
    except RuntimeError as exc:
        raise click.ClickException(str(exc))
