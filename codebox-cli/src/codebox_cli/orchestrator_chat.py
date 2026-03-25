"""Interactive chat loop for a task via the orchestrator WebSocket."""

from __future__ import annotations

from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from rich.console import Console
from rich.markdown import Markdown

from codebox_cli.orchestrator_client import OrchestratorClient


async def _stream_task_events(
    client: OrchestratorClient,
    ws,
    console: Console,
) -> None:
    """Stream and render events from the orchestrator WebSocket."""
    ai_text_buffer = ""

    try:
        async for event in client.receive_events(ws):
            etype = event.get("type")

            if etype == "status_change":
                status = event.get("status", "")
                console.print(f"[dim]status: {status}[/dim]")

            elif etype == "tool_start":
                name = event.get("name", "")
                console.print(f"[dim]  \u25cb {name} ...[/dim]")

            elif etype == "tool_end":
                name = event.get("name", "")
                output = event.get("output", "")
                if len(output) > 200:
                    output = output[:200] + "..."
                console.print(f"[dim]  \u2713 {name}:[/dim] [dim]{output}[/dim]")

            elif etype == "token":
                ai_text_buffer += event.get("text", "")

            elif etype == "done":
                final = event.get("content", "") or ai_text_buffer
                if final.strip():
                    console.print()
                    console.print(Markdown(final.strip()))
                return

            elif etype == "error":
                console.print(f"[red]error:[/red] {event.get('detail', '')}")
                return

    except KeyboardInterrupt:
        await client.send_cancel(ws)
        async for event in client.receive_events(ws):
            if event.get("type") in ("done", "error"):
                break


async def orchestrator_chat_loop(
    client: OrchestratorClient,
    task_id: str,
    *,
    watch_only: bool = False,
) -> None:
    """Connect to a task's WebSocket and interactively chat or watch events.

    If *watch_only* is True, just stream events without prompting for input
    (used right after creating a task).
    """
    console = Console()
    ws = await client.connect_task(task_id)

    try:
        if watch_only:
            console.print(f"[dim]Streaming task {task_id[:8]}...[/dim]\n")
            await _stream_task_events(client, ws, console)
            return

        # Interactive mode: prompt for follow-up messages
        prompt_session: PromptSession[str] = PromptSession(
            history=FileHistory(".codebox_history")
        )

        console.print("[dim]Orchestrator Chat[/dim]")
        console.print("[dim]Type 'exit' to quit. Ctrl+C to cancel running task.[/dim]\n")

        # First, stream the initial task response
        await _stream_task_events(client, ws, console)
        console.print()

        # Then allow follow-up messages
        while True:
            try:
                user_text = await prompt_session.prompt_async("> ")
            except (EOFError, KeyboardInterrupt):
                break

            user_text = user_text.strip()
            if not user_text:
                continue
            if user_text.lower() in ("exit", "quit"):
                break

            await client.send_message(ws, user_text)
            console.print("[dim]Thinking...[/dim]")
            await _stream_task_events(client, ws, console)
            console.print()

    finally:
        await ws.close()
