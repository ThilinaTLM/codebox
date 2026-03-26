"""Interactive chat loop for a box via the orchestrator SSE + REST API."""

from __future__ import annotations

from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from rich.console import Console
from rich.markdown import Markdown

from codebox_cli.orchestrator_client import OrchestratorClient


async def _stream_box_events(
    client: OrchestratorClient,
    box_id: str,
    console: Console,
) -> None:
    """Stream and render events from the orchestrator SSE stream."""
    ai_text_buffer = ""

    try:
        async for event in client.stream_events(box_id):
            etype = event.get("type")

            if etype == "token":
                ai_text_buffer += event.get("text", "")

            elif etype == "tool_start":
                name = event.get("name", "")
                console.print(f"[dim]  \u25cb {name} ...[/dim]")

            elif etype == "tool_end":
                name = event.get("name", "")
                output = event.get("output", "")
                if len(output) > 200:
                    output = output[:200] + "..."
                console.print(f"[dim]  \u2713 {name}:[/dim] [dim]{output}[/dim]")

            elif etype == "exec_output":
                output = event.get("output", "")
                console.print(f"[dim]{output}[/dim]", end="")

            elif etype == "exec_done":
                exit_code = event.get("output", "")
                if exit_code and exit_code != "0":
                    console.print(f"\n[yellow]exit code: {exit_code}[/yellow]")

            elif etype == "task_status_changed":
                status = event.get("status", "")
                console.print(f"[dim]task: {status}[/dim]")

            elif etype == "report_status":
                status = event.get("status", "")
                message = event.get("message", "")
                console.print(f"[bold]Report: {status}[/bold]")
                if message:
                    console.print(f"  {message}")

            elif etype == "status_change":
                parts = []
                for key in ("container_status", "task_status", "agent_report_status", "stop_reason"):
                    if key in event:
                        label = key.replace("_status", "").replace("_", " ")
                        parts.append(f"{label}={event[key]}")
                if parts:
                    console.print(f"[dim]status: {', '.join(parts)}[/dim]")

            elif etype == "shutting_down":
                reason = event.get("reason", "")
                console.print(f"[yellow]Box shutting down: {reason}[/yellow]")
                return

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
        client.send_cancel(box_id)


async def orchestrator_chat_loop(
    client: OrchestratorClient,
    box_id: str,
    *,
    watch_only: bool = False,
) -> None:
    """Connect to a box's SSE stream and interactively chat or watch events.

    If *watch_only* is True, just stream events without prompting for input
    (used right after creating a box with an initial prompt).
    """
    console = Console()

    if watch_only:
        console.print(f"[dim]Streaming box {box_id[:8]}...[/dim]\n")
        await _stream_box_events(client, box_id, console)
        return

    # Interactive mode: prompt for follow-up messages
    prompt_session: PromptSession[str] = PromptSession(
        history=FileHistory(".codebox_history")
    )

    console.print("[dim]Codebox Chat[/dim]")
    console.print("[dim]Type 'exit' to quit. Ctrl+C to cancel. Prefix with ! for shell.[/dim]\n")

    # Stream initial events if any
    await _stream_box_events(client, box_id, console)
    console.print()

    # Interactive chat
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

        if user_text.startswith("!"):
            command = user_text[1:].strip()
            if command:
                client.send_exec(box_id, command)
        else:
            client.send_message(box_id, user_text)

        console.print("[dim]Thinking...[/dim]")
        await _stream_box_events(client, box_id, console)
        console.print()
