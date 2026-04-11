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
from codebox_agent.config import AgentConfig
from codebox_agent.events import new_id
from codebox_agent.message_store import EventStore
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

    if not grpc_address:
        raise RuntimeError("ORCHESTRATOR_GRPC_ADDRESS is required")
    if not callback_token:
        raise RuntimeError("CALLBACK_TOKEN is required")

    # --- Build agent config -------------------------------------------------
    # Prefer the structured CODEBOX_AGENT_CONFIG env var (JSON) when the
    # orchestrator provides one.  Fall back to the legacy per-variable path
    # via AgentConfig.from_env().
    agent_config_raw = os.environ.get("CODEBOX_AGENT_CONFIG")
    if agent_config_raw:
        agent_config = AgentConfig.from_dict(json.loads(agent_config_raw))
        logger.info("Loaded AgentConfig from CODEBOX_AGENT_CONFIG env var")
    else:
        agent_config = AgentConfig.from_env()
        logger.info("Built AgentConfig from legacy environment variables")

    # Apply dynamic system prompt override if present.
    dynamic_system_prompt = os.environ.get("DYNAMIC_SYSTEM_PROMPT")
    if dynamic_system_prompt and not agent_config.system_prompt:
        agent_config = agent_config.model_copy(update={"system_prompt": dynamic_system_prompt})

    # Create session manager and session
    manager = SessionManager(checkpoint_db_path=_CHECKPOINT_DB_PATH)
    session = await manager.create_from_config(
        config=agent_config,
        environment_system_prompt=SANDBOX_ENVIRONMENT_SYSTEM_PROMPT,
    )
    session_id = session.session_id
    logger.info(
        "Created session %s with provider=%s model=%s",
        session_id,
        agent_config.llm.provider,
        agent_config.llm.model,
    )

    # Create local event store (same DB as checkpointer)
    event_store = EventStore(_CHECKPOINT_DB_PATH)
    await event_store.setup()

    # Send initial prompt if set via env var
    initial_prompt = os.environ.get("INITIAL_PROMPT")

    delay = _RECONNECT_BASE_DELAY
    while True:
        try:
            await _connect_and_run(
                grpc_address, session_id, manager, callback_token, event_store, initial_prompt
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
    event_store: EventStore,
    initial_prompt: str | None,
) -> None:
    """Connect to orchestrator via gRPC and run the bidirectional stream."""
    logger.info("Connecting to orchestrator gRPC at %s", grpc_address)

    async with grpc_aio.insecure_channel(grpc_address) as channel:
        stub = box_pb2_grpc.BoxServiceStub(channel)
        outbound: asyncio.Queue[box_pb2.BoxEvent | None] = asyncio.Queue()

        async def event_iterator():
            yield box_pb2.BoxEvent(register=box_pb2.RegisterEvent(session_id=session_id))
            while True:
                event = await outbound.get()
                if event is None:
                    break
                yield event

        async def send(msg: dict[str, Any]) -> None:
            """Persist canonical events or enqueue query results."""
            try:
                if "kind" in msg:
                    envelope = dict(msg)
                    envelope.setdefault("event_id", new_id("evt"))
                    stored = await event_store.append_event(envelope)
                    await outbound.put(
                        box_pb2.BoxEvent(stream_event=_dict_to_stream_event(stored))
                    )
                    return

                event = _dict_to_event(msg)
                if event is not None:
                    await outbound.put(event)
            except Exception:
                logger.debug("Failed to enqueue event", exc_info=True)

        metadata = [("authorization", f"Bearer {callback_token}")]
        response_stream = stub.Connect(event_iterator(), metadata=metadata)

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

        initial_prompt_sent = False

        try:
            async for command in response_stream:
                field = command.WhichOneof("command")
                session = manager.get(session_id)

                if field == "registered":
                    logger.info("Registered with orchestrator via gRPC, session %s", session_id)
                    if initial_prompt and not initial_prompt_sent:
                        initial_prompt_sent = True
                        await _cancel_current()
                        current_task = asyncio.create_task(
                            run_agent_stream(
                                send,
                                session_id,
                                manager,
                                new_message=initial_prompt,
                                run_id=new_id("run"),
                                input_message_id=new_id("msg"),
                                emit_input_event=True,
                            )
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
                        logger.warning("Ignoring empty message content for session %s", session_id)
                        continue

                    await _cancel_current()
                    current_task = asyncio.create_task(
                        run_agent_stream(
                            send,
                            session_id,
                            manager,
                            new_message=content,
                            run_id=command.message.run_id or new_id("run"),
                            input_message_id=command.message.message_id or new_id("msg"),
                            emit_input_event=False,
                        )
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
                        await handle_list_files(
                            send,
                            path,
                            request_id,
                            workspace_root=_WORKSPACE_ROOT,
                        )

                    elif query_field == "read_file":
                        path = query.read_file.path
                        await handle_read_file(
                            send,
                            path,
                            request_id,
                            workspace_root=_WORKSPACE_ROOT,
                        )

                    elif query_field == "exec":
                        command_str = query.exec.command
                        logger.info(
                            "Received exec query: %s (session %s)",
                            command_str[:100] if command_str else "",
                            session_id,
                        )
                        if not command_str:
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
                                run_id=query.exec.run_id or new_id("run"),
                                command_id=query.exec.command_id or new_id("cmd"),
                                emit_started_event=False,
                            )
                        )
                        session.current_task = current_task
                        current_task.add_done_callback(_on_task_done)

                    else:
                        logger.warning("Unknown query type: %s", query_field)

                else:
                    logger.warning("Unknown command type: %s", field)

        finally:
            await _cancel_current()
            await outbound.put(None)


# ──────────────────────────────────────────────────────────────
# Dict → Protobuf conversion (thin layer at sandbox boundary)
# ──────────────────────────────────────────────────────────────


def _dict_to_stream_event(  # noqa: PLR0911, PLR0912
    msg: dict[str, Any],
) -> box_pb2.StreamEvent:
    """Convert a canonical event dict to a StreamEvent protobuf."""
    base = {
        "seq": int(msg.get("seq", 0) or 0),
        "event_id": msg.get("event_id", ""),
        "timestamp_ms": int(msg.get("timestamp_ms", 0) or 0),
        "run_id": msg.get("run_id", ""),
        "turn_id": msg.get("turn_id", ""),
        "message_id": msg.get("message_id", ""),
        "tool_call_id": msg.get("tool_call_id", ""),
        "command_id": msg.get("command_id", ""),
    }
    payload = msg.get("payload", {}) or {}
    kind = msg.get("kind", "")

    if kind == "run.started":
        return box_pb2.StreamEvent(
            **base,
            run_started=box_pb2.RunStarted(
                trigger=payload.get("trigger", ""),
                input=payload.get("input", ""),
            ),
        )
    if kind == "run.completed":
        return box_pb2.StreamEvent(
            **base,
            run_completed=box_pb2.RunCompleted(summary=payload.get("summary", "")),
        )
    if kind == "run.failed":
        return box_pb2.StreamEvent(
            **base,
            run_failed=box_pb2.RunFailed(error=payload.get("error", "")),
        )
    if kind == "run.cancelled":
        return box_pb2.StreamEvent(**base, run_cancelled=box_pb2.RunCancelled())
    if kind == "turn.started":
        return box_pb2.StreamEvent(**base, turn_started=box_pb2.TurnStarted())
    if kind == "turn.completed":
        return box_pb2.StreamEvent(**base, turn_completed=box_pb2.TurnCompleted())
    if kind == "message.started":
        return box_pb2.StreamEvent(
            **base,
            message_started=box_pb2.MessageStarted(role=payload.get("role", "assistant")),
        )
    if kind == "message.delta":
        return box_pb2.StreamEvent(
            **base,
            message_delta=box_pb2.MessageDelta(text=payload.get("text", "")),
        )
    if kind == "message.completed":
        return box_pb2.StreamEvent(
            **base,
            message_completed=box_pb2.MessageCompleted(
                role=payload.get("role", "assistant"),
                content=payload.get("content", ""),
            ),
        )
    if kind == "reasoning.started":
        return box_pb2.StreamEvent(**base, reasoning_started=box_pb2.ReasoningStarted())
    if kind == "reasoning.delta":
        return box_pb2.StreamEvent(
            **base,
            reasoning_delta=box_pb2.ReasoningDelta(text=payload.get("text", "")),
        )
    if kind == "reasoning.completed":
        return box_pb2.StreamEvent(**base, reasoning_completed=box_pb2.ReasoningCompleted())
    if kind == "tool_call.started":
        return box_pb2.StreamEvent(
            **base,
            tool_call_started=box_pb2.ToolCallStarted(name=payload.get("name", "")),
        )
    if kind == "tool_call.arguments.delta":
        return box_pb2.StreamEvent(
            **base,
            tool_call_arguments_delta=box_pb2.ToolCallArgumentsDelta(text=payload.get("text", "")),
        )
    if kind == "tool_call.arguments.completed":
        return box_pb2.StreamEvent(
            **base,
            tool_call_arguments_completed=box_pb2.ToolCallArgumentsCompleted(
                arguments_json=payload.get("arguments_json", "")
            ),
        )
    if kind == "tool_call.completed":
        return box_pb2.StreamEvent(
            **base,
            tool_call_completed=box_pb2.ToolCallCompleted(
                name=payload.get("name", ""),
                output=payload.get("output", ""),
            ),
        )
    if kind == "tool_call.failed":
        return box_pb2.StreamEvent(
            **base,
            tool_call_failed=box_pb2.ToolCallFailed(
                name=payload.get("name", ""),
                error=payload.get("error", ""),
                output=payload.get("output", ""),
            ),
        )
    if kind == "command.started":
        origin = payload.get("origin", "")
        proto_origin = (
            box_pb2.COMMAND_ORIGIN_AGENT_TOOL
            if origin == "agent_tool"
            else box_pb2.COMMAND_ORIGIN_USER_EXEC
        )
        return box_pb2.StreamEvent(
            **base,
            command_started=box_pb2.CommandStarted(
                origin=proto_origin,
                command=payload.get("command", ""),
                timeout_seconds=int(payload.get("timeout_seconds", 0) or 0),
            ),
        )
    if kind == "command.output.delta":
        return box_pb2.StreamEvent(
            **base,
            command_output_delta=box_pb2.CommandOutputDelta(text=payload.get("text", "")),
        )
    if kind == "command.completed":
        origin = payload.get("origin", "")
        proto_origin = (
            box_pb2.COMMAND_ORIGIN_AGENT_TOOL
            if origin == "agent_tool"
            else box_pb2.COMMAND_ORIGIN_USER_EXEC
        )
        return box_pb2.StreamEvent(
            **base,
            command_completed=box_pb2.CommandCompleted(
                origin=proto_origin,
                exit_code=int(payload.get("exit_code", 0) or 0),
                output=payload.get("output", ""),
            ),
        )
    if kind == "command.failed":
        origin = payload.get("origin", "")
        proto_origin = (
            box_pb2.COMMAND_ORIGIN_AGENT_TOOL
            if origin == "agent_tool"
            else box_pb2.COMMAND_ORIGIN_USER_EXEC
        )
        return box_pb2.StreamEvent(
            **base,
            command_failed=box_pb2.CommandFailed(
                origin=proto_origin,
                exit_code=int(payload.get("exit_code", 1) or 1),
                error=payload.get("error", ""),
                output=payload.get("output", ""),
            ),
        )
    if kind == "state.changed":
        return box_pb2.StreamEvent(
            **base,
            state_changed=box_pb2.StateChanged(activity=payload.get("activity", "")),
        )
    if kind == "outcome.declared":
        return box_pb2.StreamEvent(
            **base,
            outcome_declared=box_pb2.OutcomeDeclared(
                status=payload.get("status", ""),
                message=payload.get("message", ""),
            ),
        )
    if kind == "input.requested":
        return box_pb2.StreamEvent(
            **base,
            input_requested=box_pb2.InputRequested(
                message=payload.get("message", ""),
                questions=list(payload.get("questions", []) or []),
            ),
        )

    raise ValueError(f"Unknown canonical event kind: {kind}")


def _build_list_files_result(msg: dict[str, Any]) -> box_pb2.BoxEvent:
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
    request_id = msg.get("request_id", "")
    error = msg.get("error", "")
    if error:
        result = box_pb2.ReadFileResult(error=error)
    else:
        data = msg.get("data", {})
        content = data.get("content", "")
        content_b64 = data.get("content_base64", "")
        if content_b64:
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
    request_id = msg.get("request_id", "")
    output = msg.get("output", "")
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


_QUERY_RESULT_BUILDERS: dict[str, Any] = {
    "list_files_result": _build_list_files_result,
    "read_file_result": _build_read_file_result,
    "exec_done": _build_exec_result,
}


def _dict_to_event(msg: dict[str, Any]) -> box_pb2.BoxEvent | None:
    msg_type = msg.get("type", "")
    if msg_type in _QUERY_RESULT_BUILDERS:
        return _QUERY_RESULT_BUILDERS[msg_type](msg)
    logger.debug("Unknown event type for protobuf conversion: %s", msg_type)
    return None
