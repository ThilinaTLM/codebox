"""Callback client: connects outbound to the orchestrator via gRPC.

On startup, creates a session locally, then connects to the orchestrator's
gRPC SandboxService and enters a bidirectional streaming loop.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
from pathlib import Path
from typing import Any

from grpc import aio as grpc_aio

from codebox_agent.agent_runner import (
    handle_list_files,
    handle_read_file,
    run_agent_stream,
    run_exec,
)
from codebox_agent.sessions import SessionManager
from codebox_sandbox.grpc.generated.codebox.sandbox import sandbox_pb2, sandbox_pb2_grpc
from codebox_sandbox.prompts import SANDBOX_ENVIRONMENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

_RECONNECT_BASE_DELAY = 1.0
_RECONNECT_MAX_DELAY = 30.0

_WORKSPACE_ROOT = Path("/workspace")
_CHECKPOINT_DB_PATH = "/app/codebox/checkpoints.db"


async def run_callback() -> None:
    """Main entry point for callback mode."""
    grpc_address = os.environ.get("ORCHESTRATOR_GRPC_ADDRESS", "")
    callback_token = os.environ.get("CALLBACK_TOKEN", "")
    provider = os.environ.get("LLM_PROVIDER", "") or (
        "openrouter" if os.environ.get("OPENROUTER_MODEL", "") else "openai"
    )
    model = (
        os.environ.get("OPENROUTER_MODEL", "")
        if provider == "openrouter"
        else os.environ.get("OPENAI_MODEL", "")
    )
    api_key = (
        os.environ.get("OPENROUTER_API_KEY", "")
        if provider == "openrouter"
        else os.environ.get("OPENAI_API_KEY", "")
    )
    base_url = os.environ.get("OPENAI_BASE_URL", "") if provider == "openai" else ""

    if not grpc_address:
        raise RuntimeError("ORCHESTRATOR_GRPC_ADDRESS is required")
    if not callback_token:
        raise RuntimeError("CALLBACK_TOKEN is required")
    if not provider:
        raise RuntimeError("LLM_PROVIDER is required")
    if not model:
        raise RuntimeError("OPENROUTER_MODEL or OPENAI_MODEL is required")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY or OPENAI_API_KEY is required")

    # Parse optional sandbox config from environment
    sandbox_config: dict[str, Any] | None = None
    sandbox_config_raw = os.environ.get("CODEBOX_SANDBOX_CONFIG")
    if sandbox_config_raw:
        sandbox_config = json.loads(sandbox_config_raw)

    # Create session manager and session
    manager = SessionManager(checkpoint_db_path=_CHECKPOINT_DB_PATH)
    dynamic_system_prompt = os.environ.get("DYNAMIC_SYSTEM_PROMPT")
    session = await manager.create(
        provider=provider,
        model=model,
        api_key=api_key,
        base_url=base_url or None,
        environment_system_prompt=SANDBOX_ENVIRONMENT_SYSTEM_PROMPT,
        dynamic_system_prompt=dynamic_system_prompt,
        sandbox_config=sandbox_config,
    )
    session_id = session.session_id
    logger.info("Created session %s with provider=%s model=%s", session_id, provider, model)

    delay = _RECONNECT_BASE_DELAY
    while True:
        try:
            await _connect_and_run(grpc_address, session_id, manager, callback_token)
            # Clean exit
            break
        except grpc_aio.AioRpcError as exc:
            logger.warning(
                "gRPC connection to orchestrator lost (%s), retrying in %.1fs",
                exc.code(),
                delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, _RECONNECT_MAX_DELAY)
        except (ConnectionRefusedError, OSError) as exc:
            logger.warning(
                "Connection to orchestrator failed (%s), retrying in %.1fs",
                exc,
                delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, _RECONNECT_MAX_DELAY)
        except Exception:
            logger.exception("Unexpected error in callback loop")
            await asyncio.sleep(delay)
            delay = min(delay * 2, _RECONNECT_MAX_DELAY)


async def _connect_and_run(  # noqa: PLR0912, PLR0915
    grpc_address: str,
    session_id: str,
    manager: SessionManager,
    callback_token: str,
) -> None:
    """Connect to orchestrator via gRPC and run the bidirectional stream."""
    logger.info("Connecting to orchestrator gRPC at %s", grpc_address)

    async with grpc_aio.insecure_channel(grpc_address) as channel:
        stub = sandbox_pb2_grpc.SandboxServiceStub(channel)

        # Outbound event queue
        outbound: asyncio.Queue[sandbox_pb2.SandboxEvent | None] = asyncio.Queue()

        async def event_iterator():
            """Async generator that yields events to send to the orchestrator."""
            # First event is always Register
            yield sandbox_pb2.SandboxEvent(
                register=sandbox_pb2.RegisterEvent(session_id=session_id)
            )
            while True:
                event = await outbound.get()
                if event is None:
                    break
                yield event

        # Send callback
        async def send(msg: dict) -> None:
            """Convert a dict event to protobuf and enqueue it."""
            try:
                event = _dict_to_event(msg)
                if event:
                    await outbound.put(event)
            except Exception:
                logger.debug("Failed to enqueue event", exc_info=True)

        metadata = [("authorization", f"Bearer {callback_token}")]
        response_stream = stub.Connect(event_iterator(), metadata=metadata)

        # Message loop
        current_task: asyncio.Task | None = None

        async def _cancel_current() -> None:
            nonlocal current_task
            if current_task and not current_task.done():
                current_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await current_task
            current_task = None

        def _on_task_done(task: asyncio.Task) -> None:
            nonlocal current_task
            session = manager.get(session_id)
            if current_task is task:
                current_task = None
                session.current_task = None

        # Inject the send function into the status reporter so the set_status tool works
        session = manager.get(session_id)
        session.status_reporter.send_fn = send

        try:
            async for command in response_stream:
                field = command.WhichOneof("command")
                session = manager.get(session_id)

                if field == "registered":
                    logger.info("Registered with orchestrator via gRPC, session %s", session_id)

                elif field == "thread_restore":
                    messages = command.thread_restore.messages
                    if messages:
                        await _handle_thread_restore(session, messages)

                elif field == "message":
                    content = command.message.content
                    logger.info(
                        "Received message command (len=%d) for session %s",
                        len(content) if content else 0,
                        session_id,
                    )
                    if not content:
                        await send({"type": "error", "detail": "Empty message content"})
                        continue

                    await _cancel_current()
                    current_task = asyncio.create_task(
                        run_agent_stream(send, session_id, manager, new_message=content)
                    )
                    session.current_task = current_task
                    current_task.add_done_callback(_on_task_done)

                elif field == "exec":
                    command_str = command.exec.content
                    logger.info(
                        "Received exec command: %s (session %s)",
                        command_str[:100] if command_str else "",
                        session_id,
                    )
                    if not command_str:
                        await send({"type": "error", "detail": "Empty exec command"})
                        continue

                    request_id = command.exec.request_id
                    await _cancel_current()
                    current_task = asyncio.create_task(
                        run_exec(
                            send,
                            command_str,
                            session_id,
                            manager,
                            request_id=request_id,
                            workspace_root=_WORKSPACE_ROOT,
                        )
                    )
                    session.current_task = current_task
                    current_task.add_done_callback(_on_task_done)

                elif field == "cancel":
                    await _cancel_current()
                    session.current_task = None
                    logger.info("Cancelled running task for session %s", session_id)

                elif field == "list_files":
                    path = command.list_files.path or str(_WORKSPACE_ROOT)
                    request_id = command.list_files.request_id
                    logger.debug("Received list_files command: path=%s", path)
                    await handle_list_files(send, path, request_id, workspace_root=_WORKSPACE_ROOT)

                elif field == "read_file":
                    path = command.read_file.path
                    request_id = command.read_file.request_id
                    logger.debug("Received read_file command: path=%s", path)
                    await handle_read_file(send, path, request_id, workspace_root=_WORKSPACE_ROOT)

                else:
                    logger.warning("Unknown command type: %s", field)
                    await send({"type": "error", "detail": f"Unknown command: {field}"})

        finally:
            await _cancel_current()
            # Signal the event iterator to stop
            await outbound.put(None)


def _dict_to_event(msg: dict[str, Any]) -> sandbox_pb2.SandboxEvent | None:  # noqa: PLR0911, PLR0912
    """Convert a dict event to a protobuf SandboxEvent."""
    msg_type = msg.get("type", "")

    if msg_type == "token":
        return sandbox_pb2.SandboxEvent(token=sandbox_pb2.TokenEvent(text=msg.get("text", "")))
    if msg_type == "model_start":
        return sandbox_pb2.SandboxEvent(model_start=sandbox_pb2.ModelStartEvent())
    if msg_type == "tool_start":
        return sandbox_pb2.SandboxEvent(
            tool_start=sandbox_pb2.ToolStartEvent(
                name=msg.get("name", ""),
                tool_call_id=msg.get("tool_call_id", ""),
                input=msg.get("input", ""),
            )
        )
    if msg_type == "tool_end":
        return sandbox_pb2.SandboxEvent(
            tool_end=sandbox_pb2.ToolEndEvent(
                name=msg.get("name", ""),
                output=msg.get("output", ""),
            )
        )
    if msg_type == "message_complete":
        msg_data = msg.get("message", {})
        tool_calls = [
            sandbox_pb2.ToolCall(
                id=tc.get("id", ""),
                name=tc.get("name", ""),
                args_json=tc.get("args_json", ""),
            )
            for tc in msg_data.get("tool_calls", [])
        ]
        chat_msg = sandbox_pb2.ChatMessage(
            role=msg_data.get("role", ""),
            content=msg_data.get("content", ""),
            tool_calls=tool_calls,
            tool_call_id=msg_data.get("tool_call_id", ""),
            tool_name=msg_data.get("tool_name", ""),
            metadata_json=msg_data.get("metadata_json", ""),
        )
        return sandbox_pb2.SandboxEvent(
            message_complete=sandbox_pb2.MessageCompleteEvent(message=chat_msg)
        )
    if msg_type == "done":
        return sandbox_pb2.SandboxEvent(done=sandbox_pb2.DoneEvent(content=msg.get("content", "")))
    if msg_type == "error":
        return sandbox_pb2.SandboxEvent(error=sandbox_pb2.ErrorEvent(detail=msg.get("detail", "")))
    if msg_type == "exec_output":
        return sandbox_pb2.SandboxEvent(
            exec_output=sandbox_pb2.ExecOutputEvent(
                output=msg.get("output", ""),
                request_id=msg.get("request_id", ""),
            )
        )
    if msg_type == "exec_done":
        return sandbox_pb2.SandboxEvent(
            exec_done=sandbox_pb2.ExecDoneEvent(
                output=msg.get("output", ""),
                request_id=msg.get("request_id", ""),
            )
        )
    if msg_type == "list_files_result":
        data = msg.get("data")
        error = msg.get("error", "")
        return sandbox_pb2.SandboxEvent(
            list_files_result=sandbox_pb2.ListFilesResultEvent(
                request_id=msg.get("request_id", ""),
                data_json=json.dumps(data) if data else "",
                error=error or "",
            )
        )
    if msg_type == "read_file_result":
        data = msg.get("data")
        error = msg.get("error", "")
        return sandbox_pb2.SandboxEvent(
            read_file_result=sandbox_pb2.ReadFileResultEvent(
                request_id=msg.get("request_id", ""),
                data_json=json.dumps(data) if data else "",
                error=error or "",
            )
        )
    if msg_type == "activity_changed":
        return sandbox_pb2.SandboxEvent(
            activity_changed=sandbox_pb2.ActivityChangedEvent(
                status=msg.get("status", ""),
            )
        )
    if msg_type == "task_outcome":
        return sandbox_pb2.SandboxEvent(
            task_outcome=sandbox_pb2.TaskOutcomeEvent(
                status=msg.get("status", ""),
                message=msg.get("message", ""),
            )
        )
    if msg_type == "tool_exec_output":
        return sandbox_pb2.SandboxEvent(
            tool_exec_output=sandbox_pb2.ToolExecOutputEvent(
                output=msg.get("output", ""),
                tool_call_id=msg.get("tool_call_id", ""),
            )
        )
    if msg_type == "thinking_token":
        return sandbox_pb2.SandboxEvent(
            thinking_token=sandbox_pb2.ThinkingTokenEvent(
                text=msg.get("text", ""),
            )
        )
    logger.debug("Unknown event type for protobuf conversion: %s", msg_type)
    return None


async def _handle_thread_restore(session: Any, messages: list[sandbox_pb2.ChatMessage]) -> None:
    """Seed the agent's checkpointer with restored messages from the orchestrator."""
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage  # noqa: PLC0415, I001

    config = {"configurable": {"thread_id": session.session_id}}

    # Check if local checkpoint already has state
    try:
        state = await session.agent.aget_state(config)
        if state and state.values and state.values.get("messages"):
            logger.info("Local checkpoint already has state, skipping thread restore")
            return
    except Exception:  # noqa: S110 - OK to swallow; missing state just means we proceed with restore
        pass

    # Convert protobuf messages to LangChain message objects
    lc_messages = []
    for msg in messages:
        role = msg.role
        content = msg.content
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
        elif role == "system":
            lc_messages.append(SystemMessage(content=content))
        elif role == "tool":
            lc_messages.append(
                ToolMessage(
                    content=content,
                    tool_call_id=msg.tool_call_id or "",
                    name=msg.tool_name or "",
                )
            )

    if lc_messages:
        try:
            await session.agent.aupdate_state(
                config=config,
                values={"messages": lc_messages},
            )
            logger.info("Restored %d messages from orchestrator", len(lc_messages))
        except Exception:
            logger.exception("Failed to restore thread state")
