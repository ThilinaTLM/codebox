"""CLI entry-point for Codebox."""

from __future__ import annotations

import asyncio
import json

import click
from rich.console import Console
from rich.markdown import Markdown
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
@click.option("--idle-timeout", "-t", type=int, default=None, help="Idle timeout in seconds.")
@click.option("--watch", is_flag=True, default=True, help="Stream box output (default: true).")
@click.option("--no-watch", is_flag=True, help="Don't stream box output.")
@click.pass_context
def box_create(
    ctx: click.Context,
    name: str | None,
    prompt: str | None,
    model: str | None,
    system_prompt: str | None,
    idle_timeout: int | None,
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
            idle_timeout=idle_timeout,
        )
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    click.echo(f"Box created: {box['id']} ({box['name']})")

    if not no_watch:
        asyncio.run(orchestrator_chat_loop(orch, box["id"], watch_only=bool(prompt)))


@box_group.command(name="list")
@click.option("--container-status", "-cs", default=None, help="Filter by container status (starting/running/stopped).")
@click.option("--task-status", "-ts", default=None, help="Filter by task status (idle/agent_working/exec_shell).")
@click.option("--trigger", default=None, help="Filter by trigger (github_issue/github_pr).")
@click.pass_context
def box_list(
    ctx: click.Context,
    container_status: str | None,
    task_status: str | None,
    trigger: str | None,
) -> None:
    """List boxes from the orchestrator."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        boxes = orch.list_boxes(
            container_status=container_status,
            task_status=task_status,
            trigger=trigger,
        )
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    if not boxes:
        click.echo("No boxes found.")
        return

    table = Table()
    table.add_column("ID", style="dim", max_width=10)
    table.add_column("Name")
    table.add_column("Container")
    table.add_column("Task")
    table.add_column("Report", style="dim")
    table.add_column("Model", style="dim")

    STATUS_COLORS = {
        "running": "green", "starting": "yellow", "stopped": "dim",
        "idle": "green", "agent_working": "yellow", "exec_shell": "yellow",
        "completed": "green", "in_progress": "yellow",
        "need_clarification": "red", "unable_to_proceed": "red", "not_enough_context": "red",
    }

    for b in boxes:
        cs = b.get("container_status", "")
        ts = b.get("task_status", "")
        rs = b.get("agent_report_status", "") or ""
        table.add_row(
            b["id"][:8],
            b["name"],
            f"[{STATUS_COLORS.get(cs, '')}]{cs}[/]",
            f"[{STATUS_COLORS.get(ts, '')}]{ts}[/]",
            f"[{STATUS_COLORS.get(rs, '')}]{rs}[/]" if rs else "",
            b.get("model", ""),
        )

    Console().print(table)


@box_group.command(name="info")
@click.argument("box_id")
@click.pass_context
def box_info(ctx: click.Context, box_id: str) -> None:
    """Show detailed information about a box."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        b = orch.get_box(box_id)
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    console = Console()
    console.print(f"[bold]{b['name']}[/bold]  [dim]{b['id']}[/dim]\n")

    rows = [
        ("Model", b.get("model", "")),
        ("Container", b.get("container_status", "")),
        ("Task", b.get("task_status", "")),
        ("Report", b.get("agent_report_status", "") or ""),
        ("Report Message", b.get("agent_report_message", "") or ""),
        ("Stop Reason", b.get("stop_reason", "") or ""),
        ("Idle Timeout", str(b.get("idle_timeout", ""))),
        ("Trigger", b.get("trigger", "") or ""),
        ("Container ID", (b.get("container_id", "") or "")[:16]),
        ("Session ID", (b.get("session_id", "") or "")[:16]),
        ("Workspace", b.get("workspace_path", "") or ""),
        ("Created", b.get("created_at", "")),
        ("Started", b.get("started_at", "") or ""),
        ("Completed", b.get("completed_at", "") or ""),
    ]

    # GitHub fields
    if b.get("github_repo"):
        rows.extend([
            ("GitHub Repo", b.get("github_repo", "")),
            ("Issue #", str(b.get("github_issue_number", "") or "")),
            ("PR #", str(b.get("github_pr_number", "") or "")),
            ("Branch", b.get("github_branch", "") or ""),
        ])

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="bold")
    table.add_column()
    for label, value in rows:
        if value:
            table.add_row(label, str(value))

    console.print(table)

    # Show initial prompt if set
    prompt = b.get("initial_prompt")
    if prompt:
        console.print(f"\n[bold]Initial Prompt:[/bold]")
        console.print(f"  {prompt[:200]}{'...' if len(prompt) > 200 else ''}")


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
        click.echo(f"Box {box_id[:8]} stopped (status: {box['container_status']})")
    except RuntimeError as exc:
        raise click.ClickException(str(exc))


@box_group.command(name="restart")
@click.argument("box_id")
@click.option("--watch", is_flag=True, default=True, help="Stream box output (default: true).")
@click.option("--no-watch", is_flag=True, help="Don't stream box output.")
@click.pass_context
def box_restart(ctx: click.Context, box_id: str, watch: bool, no_watch: bool) -> None:
    """Restart a stopped box."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        box = orch.restart_box(box_id)
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    click.echo(f"Box {box_id[:8]} restarted (status: {box['container_status']})")

    if not no_watch:
        asyncio.run(orchestrator_chat_loop(orch, box["id"], watch_only=True))


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


@box_group.command(name="events")
@click.argument("box_id")
@click.option("--limit", "-l", type=int, default=50, help="Number of events to show (default: 50).")
@click.pass_context
def box_events(ctx: click.Context, box_id: str, limit: int) -> None:
    """Show persisted events for a box."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        events = orch.get_box_events(box_id)
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    if not events:
        click.echo("No events found.")
        return

    # Show last N events
    events = events[-limit:]

    table = Table()
    table.add_column("Time", style="dim", max_width=20)
    table.add_column("Type")
    table.add_column("Data", max_width=60)

    for e in events:
        data = e.get("data") or {}
        data_str = json.dumps(data, default=str) if data else ""
        if len(data_str) > 80:
            data_str = data_str[:80] + "..."
        table.add_row(
            e.get("created_at", ""),
            e.get("event_type", ""),
            data_str,
        )

    Console().print(table)


@box_group.command(name="messages")
@click.argument("box_id")
@click.pass_context
def box_messages(ctx: click.Context, box_id: str) -> None:
    """Show chat thread for a box."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        messages = orch.get_box_messages(box_id)
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    if not messages:
        click.echo("No messages found.")
        return

    console = Console()
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "") or ""

        if role == "user":
            console.print(f"\n[bold blue]User:[/bold blue]")
            console.print(f"  {content}")
        elif role == "assistant":
            console.print(f"\n[bold green]Assistant:[/bold green]")
            if content.strip():
                console.print(Markdown(content.strip()))
        elif role == "tool":
            tool_name = msg.get("tool_name", "tool")
            output = content[:200] + "..." if len(content) > 200 else content
            console.print(f"[dim]  tool ({tool_name}): {output}[/dim]")
        elif role == "system":
            console.print(f"[dim italic]system: {content[:100]}[/dim italic]")


@box_group.command(name="files")
@click.argument("box_id")
@click.argument("path", default="/workspace")
@click.pass_context
def box_files(ctx: click.Context, box_id: str, path: str) -> None:
    """List files in a box workspace."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        result = orch.list_files(box_id, path)
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    console = Console()
    if isinstance(result, list):
        for item in result:
            if isinstance(item, dict):
                name = item.get("name", "")
                is_dir = item.get("is_dir", False)
                size = item.get("size", "")
                prefix = "d " if is_dir else "  "
                console.print(f"[dim]{prefix}[/dim]{name}  [dim]{size}[/dim]")
            else:
                console.print(str(item))
    else:
        console.print(json.dumps(result, indent=2, default=str))


@box_group.command(name="cat")
@click.argument("box_id")
@click.argument("path")
@click.pass_context
def box_cat(ctx: click.Context, box_id: str, path: str) -> None:
    """Read a file from a box workspace."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        result = orch.read_file(box_id, path)
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    if isinstance(result, dict):
        content = result.get("content", "")
        click.echo(content)
    else:
        click.echo(str(result))


# ── Container commands ──────────────────────────────────────


@cli.group(name="container")
@click.option(
    "--url",
    default=None,
    envvar="CODEBOX_ORCHESTRATOR_URL",
    help="Orchestrator URL (default: $CODEBOX_ORCHESTRATOR_URL or http://localhost:8080).",
)
@click.pass_context
def container_group(ctx: click.Context, url: str | None) -> None:
    """Manage Docker containers via the orchestrator."""
    ctx.ensure_object(dict)
    ctx.obj["orch"] = OrchestratorClient(base_url=url or ORCHESTRATOR_URL)


@container_group.command(name="list")
@click.pass_context
def container_list(ctx: click.Context) -> None:
    """List Docker containers."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        containers = orch.list_containers()
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    if not containers:
        click.echo("No containers found.")
        return

    table = Table()
    table.add_column("ID", style="dim", max_width=14)
    table.add_column("Name")
    table.add_column("Status")
    table.add_column("Image", style="dim")

    for c in containers:
        table.add_row(
            c["id"][:12],
            c["name"],
            c["status"],
            c.get("image", ""),
        )

    Console().print(table)


@container_group.command(name="logs")
@click.argument("container_id")
@click.option("--tail", "-n", type=int, default=200, help="Number of log lines (default: 200).")
@click.pass_context
def container_logs(ctx: click.Context, container_id: str, tail: int) -> None:
    """Show container logs."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        logs = orch.get_container_logs(container_id, tail=tail)
    except RuntimeError as exc:
        raise click.ClickException(str(exc))

    click.echo(logs)


@container_group.command(name="start")
@click.argument("container_id")
@click.pass_context
def container_start(ctx: click.Context, container_id: str) -> None:
    """Start a container."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        orch.start_container(container_id)
        click.echo(f"Container {container_id[:12]} started.")
    except RuntimeError as exc:
        raise click.ClickException(str(exc))


@container_group.command(name="stop")
@click.argument("container_id")
@click.pass_context
def container_stop(ctx: click.Context, container_id: str) -> None:
    """Stop a container."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        orch.stop_container(container_id)
        click.echo(f"Container {container_id[:12]} stopped.")
    except RuntimeError as exc:
        raise click.ClickException(str(exc))


@container_group.command(name="delete")
@click.argument("container_id")
@click.pass_context
def container_delete(ctx: click.Context, container_id: str) -> None:
    """Delete a container."""
    orch: OrchestratorClient = ctx.obj["orch"]
    try:
        orch.delete_container(container_id)
        click.echo(f"Container {container_id[:12]} deleted.")
    except RuntimeError as exc:
        raise click.ClickException(str(exc))
