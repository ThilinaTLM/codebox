"""Callback client: connects outbound to the orchestrator via gRPC.

On startup, creates a session locally, then connects to the orchestrator's
gRPC BoxService and enters a bidirectional streaming loop.
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
from codebox_agent.message_store import MessageStore
from codebox_agent.sessions import SessionManager
from codebox_sandbox.grpc.generated.codebox.box import box_pb2, box_pb2_grpc
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

    # Create message store (same DB as checkpointer)
    message_store = MessageStore(_CHECKPOINT_DB_PATH)
    await message_store.setup()

    # Send initial prompt if set via env var
    initial_prompt = os.environ.get("INITIAL_PROMPT")

    delay = _RECONNECT_BASE_DELAY
    while True:
        try:
            await _connect_and_run(
                grpc_address, session_id, manager, callback_token, message_store, initial_prompt
            )
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
    message_store: MessageStore,
    initial_prompt: str | None,
) -> None:
    """Connect to orchestrator via gRPC and run the bidirectional stream."""
    logger.info("Connecting to orchestrator gRPC at %s", grpc_address)

    # Track current activity in-memory for state queries
    current_activity = "idle"

    async with grpc_aio.insecure_channel(grpc_address) as channel:
        stub = box_pb2_grpc.BoxServiceStub(channel)

        # Outbound event queue
        outbound: asyncio.Queue[box_pb2.BoxEvent | None] = asyncio.Queue()

        async def event_iterator():
            """Async generator that yields events to send to the orchestrator."""
            # First event is always Register
            yield box_pb2.BoxEvent(register=box_pb2.RegisterEvent(session_id=session_id))
            while True:
                event = await outbound.get()
                if event is None:
                    break
                yield event

        # Send callback — converts agent dicts to protobuf and enqueues
        async def send(msg: dict) -> None:
            """Convert a dict event to protobuf and enqueue it.

            Also persists messages and state changes to the local message store.
            """
            nonlocal current_activity
            try:
                msg_type = msg.get("type", "")

                # Persist message_complete events
                if msg_type == "message_complete":
                    msg_data = msg.get("message", {})
                    await message_store.append_message(
                        role=msg_data.get("role", ""),
                        content=msg_data.get("content"),
                        tool_calls=msg_data.get("tool_calls"),
                        tool_call_id=msg_data.get("tool_call_id"),
                        tool_name=msg_data.get("tool_name"),
                        metadata_json=msg_data.get("metadata_json"),
                    )

                # Persist activity changes
                if msg_type == "activity_changed":
                    current_activity = msg.get("status", "idle")
                    await message_store.set_state("activity", current_activity)

                # Persist task outcome
                if msg_type == "task_outcome":
                    await message_store.set_state("task_outcome", msg.get("status", ""))
                    await message_store.set_state("task_outcome_message", msg.get("message", ""))

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

        # Track whether initial prompt has been sent (only on first connect)
        initial_prompt_sent = False

        try:
            async for command in response_stream:
                field = command.WhichOneof("command")
                session = manager.get(session_id)

                if field == "registered":
                    logger.info("Registered with orchestrator via gRPC, session %s", session_id)
                    # Send initial prompt on first registration if set
                    if initial_prompt and not initial_prompt_sent:
                        initial_prompt_sent = True
                        # Persist and send the initial prompt as a user message
                        await message_store.append_message(role="user", content=initial_prompt)
                        await _cancel_current()
                        current_task = asyncio.create_task(
                            run_agent_stream(send, session_id, manager, new_message=initial_prompt)
                        )
                        session.current_task = current_task
                        current_task.add_done_callback(_on_task_done)

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

                    # Persist user message
                    await message_store.append_message(role="user", content=content)

                    await _cancel_current()
                    current_task = asyncio.create_task(
                        run_agent_stream(send, session_id, manager, new_message=content)
                    )
                    session.current_task = current_task
                    current_task.add_done_callback(_on_task_done)

                elif field == "cancel":
                    await _cancel_current()
                    session.current_task = None
                    logger.info("Cancelled running task for session %s", session_id)

                elif field == "query":
                    query = command.query
                    request_id = query.request_id
                    query_field = query.WhichOneof("request")

                    if query_field == "list_files":
                        path = query.list_files.path or str(_WORKSPACE_ROOT)
                        logger.debug("Received list_files query: path=%s", path)
                        await handle_list_files(
                            send, path, request_id, workspace_root=_WORKSPACE_ROOT
                        )

                    elif query_field == "read_file":
                        path = query.read_file.path
                        logger.debug("Received read_file query: path=%s", path)
                        await handle_read_file(
                            send, path, request_id, workspace_root=_WORKSPACE_ROOT
                        )

                    elif query_field == "exec":
                        command_str = query.exec.command
                        logger.info(
                            "Received exec query: %s (session %s)",
                            command_str[:100] if command_str else "",
                            session_id,
                        )
                        if not command_str:
                            await send({"type": "error", "detail": "Empty exec command"})
                            continue

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

                    elif query_field == "get_messages":
                        await _handle_get_messages(outbound, message_store, request_id)

                    elif query_field == "get_box_state":
                        await _handle_get_box_state(
                            outbound, message_store, request_id, current_activity
                        )

                    else:
                        logger.warning("Unknown query type: %s", query_field)

                else:
                    logger.warning("Unknown command type: %s", field)
                    await send({"type": "error", "detail": f"Unknown command: {field}"})

        finally:
            await _cancel_current()
            # Signal the event iterator to stop
            await outbound.put(None)


async def _handle_get_messages(
    outbound: asyncio.Queue,
    store: MessageStore,
    request_id: str,
) -> None:
    """Handle GetMessagesQuery: read messages from store and send back."""
    messages = await store.get_messages()
    proto_messages = []
    for m in messages:
        tool_calls = []
        if m.get("tool_calls"):
            tool_calls = [
                box_pb2.ToolCall(
                    id=tc.get("id", ""),
                    name=tc.get("name", ""),
                    args_json=tc.get("args_json", ""),
                )
                for tc in m["tool_calls"]
            ]
        proto_messages.append(
            box_pb2.ChatMessage(
                role=m.get("role", ""),
                content=m.get("content", "") or "",
                tool_calls=tool_calls,
                tool_call_id=m.get("tool_call_id", "") or "",
                tool_name=m.get("tool_name", "") or "",
                metadata_json=m.get("metadata_json", "") or "",
            )
        )
    event = box_pb2.BoxEvent(
        query_result=box_pb2.QueryResult(
            request_id=request_id,
            get_messages=box_pb2.GetMessagesResult(messages=proto_messages),
        )
    )
    await outbound.put(event)


async def _handle_get_box_state(
    outbound: asyncio.Queue,
    store: MessageStore,
    request_id: str,
    current_activity: str,
) -> None:
    """Handle GetBoxStateQuery: read state from store and send back."""
    task_outcome = await store.get_state("task_outcome") or ""
    task_outcome_message = await store.get_state("task_outcome_message") or ""
    event = box_pb2.BoxEvent(
        query_result=box_pb2.QueryResult(
            request_id=request_id,
            get_box_state=box_pb2.GetBoxStateResult(
                activity=current_activity,
                task_outcome=task_outcome,
                task_outcome_message=task_outcome_message,
            ),
        )
    )
    await outbound.put(event)


# ──────────────────────────────────────────────────────────────
# Dict → Protobuf conversion (thin layer at sandbox boundary)
# ──────────────────────────────────────────────────────────────


def _build_message_completed(msg: dict[str, Any]) -> box_pb2.AgentOutput:
    """Build a MessageCompleted agent output from a dict."""
    msg_data = msg.get("message", {})
    tool_calls = [
        box_pb2.ToolCall(
            id=tc.get("id", ""),
            name=tc.get("name", ""),
            args_json=tc.get("args_json", ""),
        )
        for tc in msg_data.get("tool_calls", [])
    ]
    chat_msg = box_pb2.ChatMessage(
        role=msg_data.get("role", ""),
        content=msg_data.get("content", ""),
        tool_calls=tool_calls,
        tool_call_id=msg_data.get("tool_call_id", ""),
        tool_name=msg_data.get("tool_name", ""),
        metadata_json=msg_data.get("metadata_json", ""),
    )
    return box_pb2.AgentOutput(message_completed=box_pb2.MessageCompleted(message=chat_msg))


# Builder registries — declarative mapping from dict type to protobuf
_AGENT_OUTPUT_BUILDERS: dict[str, Any] = {
    "token": lambda m: box_pb2.AgentOutput(token=box_pb2.TokenChunk(text=m.get("text", ""))),
    "thinking_token": lambda m: box_pb2.AgentOutput(
        thinking=box_pb2.ThinkingChunk(text=m.get("text", ""))
    ),
    "model_start": lambda _: box_pb2.AgentOutput(model_started=box_pb2.ModelStarted()),
    "tool_start": lambda m: box_pb2.AgentOutput(
        tool_started=box_pb2.ToolStarted(
            name=m.get("name", ""),
            tool_call_id=m.get("tool_call_id", ""),
            input_json=m.get("input", ""),
        )
    ),
    "tool_exec_output": lambda m: box_pb2.AgentOutput(
        tool_output=box_pb2.ToolOutput(
            output=m.get("output", ""),
            tool_call_id=m.get("tool_call_id", ""),
        )
    ),
    "tool_end": lambda m: box_pb2.AgentOutput(
        tool_finished=box_pb2.ToolFinished(name=m.get("name", ""), output=m.get("output", ""))
    ),
    "message_complete": _build_message_completed,
    "exec_output": lambda m: box_pb2.AgentOutput(
        exec_chunk=box_pb2.ExecChunk(
            output=m.get("output", ""),
            request_id=m.get("request_id", ""),
        )
    ),
}

_STATE_CHANGE_BUILDERS: dict[str, Any] = {
    "activity_changed": lambda m: box_pb2.StateChange(
        activity=box_pb2.ActivityChanged(status=m.get("status", ""))
    ),
    "task_outcome": lambda m: box_pb2.StateChange(
        outcome=box_pb2.TaskOutcome(status=m.get("status", ""), message=m.get("message", ""))
    ),
}

_LIFECYCLE_BUILDERS: dict[str, Any] = {
    "done": lambda m: box_pb2.BoxEvent(done=box_pb2.DoneEvent(content=m.get("content", ""))),
    "error": lambda m: box_pb2.BoxEvent(error=box_pb2.ErrorEvent(detail=m.get("detail", ""))),
}


def _build_list_files_result(msg: dict[str, Any]) -> box_pb2.BoxEvent:
    """Build a ListFilesResult query result from a dict."""
    request_id = msg.get("request_id", "")
    error = msg.get("error", "")
    if error:
        result = box_pb2.ListFilesResult(error=error)
    else:
        data = msg.get("data", {})
        entries = [
            box_pb2.FileEntry(
                name=e.get("name", ""),
                path=e.get("path", ""),
                is_dir=e.get("is_dir", False),
                size=e.get("size") or 0,
            )
            for e in data.get("entries", [])
        ]
        result = box_pb2.ListFilesResult(entries=entries)
    return box_pb2.BoxEvent(
        query_result=box_pb2.QueryResult(request_id=request_id, list_files=result)
    )


def _build_read_file_result(msg: dict[str, Any]) -> box_pb2.BoxEvent:
    """Build a ReadFileResult query result from a dict."""
    request_id = msg.get("request_id", "")
    error = msg.get("error", "")
    if error:
        result = box_pb2.ReadFileResult(error=error)
    else:
        data = msg.get("data", {})
        content = data.get("content", "")
        content_b64 = data.get("content_base64", "")
        if content_b64:
            # Binary file — send as base64
            result = box_pb2.ReadFileResult(
                content=content_b64,
                encoding="base64",
                truncated=data.get("truncated", False),
            )
        else:
            result = box_pb2.ReadFileResult(
                content=content,
                encoding="utf-8",
                truncated=data.get("truncated", False),
            )
    return box_pb2.BoxEvent(
        query_result=box_pb2.QueryResult(request_id=request_id, read_file=result)
    )


def _build_exec_result(msg: dict[str, Any]) -> box_pb2.BoxEvent:
    """Build an ExecResult query result from a dict."""
    request_id = msg.get("request_id", "")
    output = msg.get("output", "")
    # The agent_runner sends exit code as string in the "output" field
    try:
        exit_code = int(output)
    except (ValueError, TypeError):
        exit_code = -1
    return box_pb2.BoxEvent(
        query_result=box_pb2.QueryResult(
            request_id=request_id,
            exec=box_pb2.ExecResult(exit_code=exit_code),
        )
    )


# Query result builders — for events that come back from agent_runner file/exec handlers
_QUERY_RESULT_BUILDERS: dict[str, Any] = {
    "list_files_result": _build_list_files_result,
    "read_file_result": _build_read_file_result,
    "exec_done": _build_exec_result,
}


def _dict_to_event(msg: dict[str, Any]) -> box_pb2.BoxEvent | None:
    """Convert an agent dict event to a BoxEvent protobuf.

    Uses builder registries for declarative mapping. Each event type
    is handled by a single entry in one of the registries.
    """
    msg_type = msg.get("type", "")

    # Agent output events (tokens, tools, messages, exec chunks)
    if msg_type in _AGENT_OUTPUT_BUILDERS:
        return box_pb2.BoxEvent(agent_output=_AGENT_OUTPUT_BUILDERS[msg_type](msg))

    # State change events (activity, task outcome)
    if msg_type in _STATE_CHANGE_BUILDERS:
        return box_pb2.BoxEvent(state_change=_STATE_CHANGE_BUILDERS[msg_type](msg))

    # Lifecycle events (done, error)
    if msg_type in _LIFECYCLE_BUILDERS:
        return _LIFECYCLE_BUILDERS[msg_type](msg)

    # Query results (file ops, exec done) — from agent_runner handlers
    if msg_type in _QUERY_RESULT_BUILDERS:
        return _QUERY_RESULT_BUILDERS[msg_type](msg)

    logger.debug("Unknown event type for protobuf conversion: %s", msg_type)
    return None
