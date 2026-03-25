"""CLI entry-point for Codebox."""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table

from codebox_cli.config import DEFAULT_IMAGE, OPENROUTER_API_KEY, OPENROUTER_MODEL, ORCHESTRATOR_URL
from codebox_cli.docker_manager import spawn, list_running, stop, get_token, get_port, remove, get_logs
from codebox_cli.client import CodeboxClient
from codebox_cli.chat import chat_loop
from codebox_cli.orchestrator_client import OrchestratorClient
from codebox_cli.orchestrator_chat import orchestrator_chat_loop


async def _do_connect(container_name: str, wait: bool = False) -> None:
    """Connect to a running sandbox and start interactive chat.

    If *wait* is True, poll up to 15 seconds for the daemon health check
    to respond before giving up (useful right after spawning).
    """
    if wait:
        token: str | None = None
        port: int | None = None
        # Retry loop: wait for the daemon to become ready
        for attempt in range(15):
            try:
                token = get_token(container_name)
                port = get_port(container_name)
                # Try a lightweight REST call to confirm the daemon is up
                client = CodeboxClient(host="localhost", port=port, token=token)
                client._rest_request("GET", "/sessions")
                break
            except Exception:
                if attempt < 14:
                    time.sleep(1)
                else:
                    raise click.ClickException(
                        "Timed out waiting for daemon to start. "
                        "Check container logs with: docker logs " + container_name
                    )
    else:
        token = get_token(container_name)
        port = get_port(container_name)

    assert token is not None
    assert port is not None

    client = CodeboxClient(host="localhost", port=port, token=token)
    session = await client.create_session(
        model=OPENROUTER_MODEL or None,
        api_key=OPENROUTER_API_KEY or None,
    )
    await chat_loop(client, session["session_id"])


@click.group()
def cli() -> None:
    """Codebox \u2014 manage and connect to sandboxed coding agents."""


@cli.command(name="spawn")
@click.option("--image", default=DEFAULT_IMAGE, help="Docker image to use.")
@click.option("--name", default=None, help="Container name.")
@click.option("--model", default=None, help="Override LLM model.")
@click.option(
    "--mount",
    default=None,
    type=click.Path(),
    help="Local directory to mount as /workspace.",
)
@click.option("--port", default=None, type=int, help="Host port (random if not set).")
@click.option("--connect", "auto_connect", is_flag=True, help="Connect immediately after spawning.")
@click.option("--no-mount", is_flag=True, help="Don't mount a workspace directory.")
def spawn_cmd(
    image: str,
    name: str | None,
    model: str | None,
    mount: str | None,
    port: int | None,
    auto_connect: bool,
    no_mount: bool,
) -> None:
    """Start a new sandbox container."""
    if mount:
        mount_path = Path(mount).resolve()
        if not mount_path.exists():
            if click.confirm(f"Directory '{mount_path}' does not exist. Create it?"):
                mount_path.mkdir(parents=True, exist_ok=True)
                click.echo(f"Created {mount_path}")
            else:
                raise click.Abort()
        mount = str(mount_path)
    elif no_mount:
        mount = None
    else:
        # Auto-create a temporary workspace directory
        mount = tempfile.mkdtemp(prefix="codebox-")
        click.echo(f"Workspace: {mount}")

    result = spawn(
        image=image,
        name=name,
        model=model,
        api_key=OPENROUTER_API_KEY,
        mount_path=mount,
        port=port,
    )
    click.echo(f"Container started: {result['name']} (id: {result['id'][:12]})")
    click.echo(f"Port: {result['port']}")

    if auto_connect:
        asyncio.run(_do_connect(result["name"], wait=True))


@cli.command(name="list")
def list_cmd() -> None:
    """List running sandbox containers."""
    containers = list_running()
    if not containers:
        click.echo("No running codebox containers.")
        return

    table = Table()
    table.add_column("Name")
    table.add_column("ID", style="dim")
    table.add_column("Port")
    table.add_column("Status")
    table.add_column("Model", style="dim")
    table.add_column("Image", style="dim")

    for c in containers:
        table.add_row(
            c["name"],
            c["id"][:12],
            str(c["port"] or "-"),
            c["status"],
            c.get("model", ""),
            c.get("image", ""),
        )

    Console().print(table)


cli.add_command(list_cmd, name="ps")


@cli.command(name="connect")
@click.argument("container", required=False, default=None)
def connect(container: str | None) -> None:
    """Connect to a running sandbox and start interactive chat."""
    if container is None:
        containers = list_running()
        if len(containers) == 0:
            raise click.ClickException("No running codebox containers.")
        elif len(containers) == 1:
            container = containers[0]["name"]
            click.echo(f"Auto-connecting to {container}...")
        else:
            lines = ["Multiple containers running. Specify one:"]
            for c in containers:
                lines.append(f"  {c['name']}  {c['id'][:12]}  port:{c['port']}")
            raise click.ClickException("\n".join(lines))

    asyncio.run(_do_connect(container))


@cli.command(name="stop")
@click.argument("container")
@click.option("--force", is_flag=True, help="Force kill the container.")
def stop_cmd(container: str, force: bool) -> None:
    """Stop and remove a sandbox container."""
    stop(container, force=force)
    click.echo(f"Container stopped: {container}")


@cli.command(name="rm")
@click.argument("container")
def rm_cmd(container: str) -> None:
    """Remove a container (running or stopped)."""
    remove(container)
    click.echo(f"Container removed: {container}")


@cli.command(name="exec")
@click.argument("container")
def exec_cmd(container: str) -> None:
    """Open an interactive shell inside a sandbox container."""
    os.execvp("docker", ["docker", "exec", "-it", container, "/bin/bash"])


@cli.command(name="logs")
@click.argument("container")
@click.option("-f", "--follow", is_flag=True, help="Follow log output.")
@click.option("-n", "--tail", default=100, help="Number of lines to show from the end.")
def logs_cmd(container: str, follow: bool, tail: int) -> None:
    """View logs from a sandbox container."""
    for chunk in get_logs(container, follow=follow, tail=tail):
        sys.stdout.write(chunk)
        sys.stdout.flush()


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
