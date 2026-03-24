"""Interactive chat loop for a Codebox session."""

from __future__ import annotations

import asyncio

from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from rich.console import Console
from rich.markdown import Markdown

from codebox_cli.client import CodeboxClient


async def _handle_exec(
    client: CodeboxClient,
    ws,
    command: str,
    console: Console,
) -> None:
    """Send a direct shell command and render the streamed output."""
    await client.send_exec(ws, command)

    try:
        async for event in client.receive_events(ws):
            etype = event.get("type")

            if etype == "exec_output":
                # Print raw output without markup (could contain brackets etc.)
                console.print(event.get("output", ""), end="", highlight=False)

            elif etype == "exec_done":
                rc = event.get("output", "0")
                if rc and rc != "0":
                    console.print(f"[dim](exit code {rc})[/dim]")
                break

            elif etype == "error":
                console.print(f"[red]error:[/red] {event.get('detail', '')}")
                break

    except KeyboardInterrupt:
        await client.send_cancel(ws)
        async for event in client.receive_events(ws):
            if event.get("type") in ("exec_done", "error"):
                break


async def _handle_agent_message(
    client: CodeboxClient,
    ws,
    user_text: str,
    console: Console,
) -> None:
    """Send a message to the agent and render the streamed response."""
    await client.send_message(ws, user_text)
    console.print("[dim]Thinking...[/dim]")

    ai_text_buffer = ""

    try:
        async for event in client.receive_events(ws):
            etype = event.get("type")

            if etype == "tool_start":
                name = event.get("name", "")
                console.print(f"[dim]  \u25cb {name} ...[/dim]")

            elif etype == "tool_end":
                name = event.get("name", "")
                output = event.get("output", "")
                if len(output) > 200:
                    output = output[:200] + "..."
                console.print(
                    f"[dim]  \u2713 {name}:[/dim] [dim]{output}[/dim]"
                )

            elif etype == "token":
                ai_text_buffer += event.get("text", "")

            elif etype == "done":
                final = event.get("content", "") or ai_text_buffer
                if final.strip():
                    console.print()
                    console.print(Markdown(final.strip()))
                break

            elif etype == "error":
                console.print(
                    f"[red]error:[/red] {event.get('detail', '')}"
                )
                break

    except KeyboardInterrupt:
        await client.send_cancel(ws)
        # Drain until the server acknowledges cancellation.
        async for event in client.receive_events(ws):
            if event.get("type") in ("done", "error"):
                break


async def chat_loop(client: CodeboxClient, session_id: str) -> None:
    """Run an interactive prompt that streams events from the sandbox daemon."""
    console = Console()
    prompt_session: PromptSession[str] = PromptSession(
        history=FileHistory(".codebox_history")
    )

    console.print("[dim]Codebox Chat[/dim]")
    console.print("[dim]Type 'exit' to quit. Use '! <cmd>' to run shell commands. Ctrl+C to cancel.[/dim]\n")

    ws = await client.connect_session(session_id)
    try:
        while True:
            # ---- read user input ----
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
                # Direct shell execution — skip the LLM
                command = user_text[1:].strip()
                if command:
                    await _handle_exec(client, ws, command, console)
                else:
                    console.print("[dim]Usage: ! <command>[/dim]")
            else:
                await _handle_agent_message(client, ws, user_text, console)

            console.print()
    finally:
        await ws.close()
