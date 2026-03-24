import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openrouter import ChatOpenRouter
from deepagents import create_deep_agent
from deepagents.backends import LocalShellBackend

from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from rich.console import Console
from rich.markdown import Markdown

load_dotenv()
load_dotenv(".env.local", override=True)

def create_agent():
    llm = ChatOpenRouter(
        model=os.environ["OPENROUTER_MODEL"],
        temperature=0,
        api_key=os.environ["OPENROUTER_API_KEY"],
    )

    cwd = str(Path.cwd().resolve())

    backend = LocalShellBackend(
        root_dir=cwd,
        virtual_mode=True,
        timeout=120,
        inherit_env=True,
    )

    return create_deep_agent(
        model=llm,
        tools=[],
        backend=backend,
        system_prompt=(
            "You are a helpful coding assistant. "
            "You have access to tools for filesystem operations "
            "(ls, read_file, write_file, edit_file, glob, grep) "
            "and shell execution (execute). Use them to help the user with coding tasks. "
        ),
    )


def extract_token(chunk) -> str:
    if isinstance(chunk.content, str):
        return chunk.content
    elif isinstance(chunk.content, list):
        return "".join(
            b.get("text", "")
            for b in chunk.content
            if isinstance(b, dict)
        )
    return ""


async def run_agent(agent, messages: list[dict], console: Console) -> str:
    ai_text_buffer = ""
    final_ai_text = ""

    try:
        async for event in agent.astream_events(
            {"messages": messages}, version="v2"
        ):
            kind = event["event"]

            if kind == "on_chat_model_start":
                if ai_text_buffer.strip():
                    final_ai_text = ai_text_buffer
                ai_text_buffer = ""

            elif kind == "on_tool_start":
                tool_name = event["name"]
                console.print(f"[dim]  ○ {tool_name} ...[/dim]")

            elif kind == "on_tool_end":
                tool_name = event["name"]
                output = event["data"].get("output", "")
                output_str = str(
                    output.content if hasattr(output, "content") else output
                )
                if len(output_str) > 200:
                    output_str = output_str[:200] + "..."
                console.print(f"[dim]  ✓ {tool_name}:[/dim] [dim]{output_str}[/dim]")

            elif kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    token = extract_token(chunk)
                    if token:
                        ai_text_buffer += token

        result = ai_text_buffer.strip() or final_ai_text.strip()
        if result:
            console.print()
            console.print(Markdown(result))
        return result

    except Exception as e:
        console.print(f"[red]error:[/red] {e}")
        return ""


async def main():
    load_dotenv()
    console = Console()
    agent = create_agent()
    messages: list[dict] = []
    session = PromptSession(history=FileHistory(".chat_history"))

    model = os.environ.get("OPENROUTER_MODEL", "")
    console.print(f"[dim]Deep Agents Chat[/dim]  [dim italic]{model}[/dim italic]")
    console.print("[dim]Type 'exit' to quit.[/dim]\n")

    while True:
        try:
            user_text = await session.prompt_async("> ")
        except (EOFError, KeyboardInterrupt):
            break

        user_text = user_text.strip()
        if not user_text:
            continue
        if user_text.lower() in ("exit", "quit"):
            break

        messages.append({"role": "user", "content": user_text})
        console.print("[dim]Thinking...[/dim]")

        ai_text = await run_agent(agent, messages, console)

        if ai_text:
            messages.append({"role": "assistant", "content": ai_text})
        console.print()


if __name__ == "__main__":
    asyncio.run(main())
