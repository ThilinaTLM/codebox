"""Thin gRPC adapter for sandbox <-> orchestrator communication.

Handles protobuf serialization, authentication, and stream lifecycle.
Delegates all business logic to application-layer handlers.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

import grpc
from grpc import aio as grpc_aio

from codebox_orchestrator.agent.application.commands.handle_sandbox_event import HandleSandboxEventHandler
from codebox_orchestrator.agent.infrastructure.callback_registry import CallbackRegistry, ConnectionHandle
from codebox_orchestrator.agent.infrastructure.callback_token import decode_callback_token
from codebox_orchestrator.box.ports.box_repository import BoxRepository
from codebox_orchestrator.agent.infrastructure.grpc.generated.codebox.sandbox import sandbox_pb2, sandbox_pb2_grpc

logger = logging.getLogger(__name__)


class SandboxServiceServicer(sandbox_pb2_grpc.SandboxServiceServicer):

    def __init__(
        self,
        event_handler: HandleSandboxEventHandler,
        registry: CallbackRegistry,
        repo: BoxRepository,
    ) -> None:
        self._event_handler = event_handler
        self._registry = registry
        self._repo = repo

    async def Connect(
        self,
        request_iterator: AsyncIterator[sandbox_pb2.SandboxEvent],
        context: grpc_aio.ServicerContext,
    ) -> AsyncIterator[sandbox_pb2.OrchestratorCommand]:
        # Auth -- extract and verify JWT token from metadata
        metadata = dict(context.invocation_metadata())
        auth_header = metadata.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Missing auth token")
            return
        token = auth_header[len("Bearer "):]
        result = decode_callback_token(token)
        if result is None:
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid callback token")
            return
        entity_id, entity_type = result

        # Verify box exists
        box = await self._repo.get(entity_id)
        if box is None:
            await context.abort(grpc.StatusCode.NOT_FOUND, "Box not found")
            return

        logger.info("gRPC connection from %s %s", entity_type, entity_id)

        # Replace stale connection
        old_conn = self._registry.get_connection(entity_id)
        if old_conn is not None:
            logger.info("Replacing stale connection for %s", entity_id)
            self._registry.remove(entity_id)
        self._registry.init_connection_state(entity_id)

        # Wait for RegisterEvent
        try:
            first_event = await request_iterator.__anext__()
        except (StopAsyncIteration, grpc_aio.AioRpcError):
            logger.warning("Box %s disconnected during registration", entity_id)
            return
        if not first_event.HasField("register"):
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "Expected RegisterEvent")
            return
        session_id = first_event.register.session_id

        # Register connection
        handle = ConnectionHandle()
        self._registry.set_connection(entity_id, handle)

        # Store session_id on box
        box_entity = await self._repo.get(entity_id)
        if box_entity:
            box_entity.session_id = session_id
            await self._repo.save(box_entity)

        logger.info("Box %s registered via gRPC (session %s)", entity_id, session_id)

        # Send RegisteredCommand
        yield sandbox_pb2.OrchestratorCommand(
            registered=sandbox_pb2.RegisteredCommand()
        )

        # Thread restore
        try:
            restore_messages = await self._get_restore_messages(entity_id)
            if restore_messages:
                yield sandbox_pb2.OrchestratorCommand(
                    thread_restore=sandbox_pb2.ThreadRestoreCommand(
                        messages=restore_messages
                    )
                )
                logger.info("Sent thread_restore with %d messages for %s", len(restore_messages), entity_id)
        except Exception:
            logger.exception("Failed to send thread_restore for %s", entity_id)

        # Concurrent event reader + command writer
        event_reader_task = asyncio.create_task(
            self._read_events(request_iterator, entity_id)
        )
        try:
            while not context.cancelled():
                if event_reader_task.done():
                    while not handle.command_queue.empty():
                        cmd = handle.command_queue.get_nowait()
                        yield self._dict_to_command(cmd)
                    break
                try:
                    cmd = await asyncio.wait_for(handle.command_queue.get(), timeout=1.0)
                    yield self._dict_to_command(cmd)
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            pass
        finally:
            if not event_reader_task.done():
                event_reader_task.cancel()
                try:
                    await event_reader_task
                except (asyncio.CancelledError, Exception):
                    pass
            self._registry.remove(entity_id)
            await self._event_handler.set_container_stopped_if_running(entity_id, "container_error")
            logger.info("gRPC connection closed for box %s", entity_id)

    async def _read_events(self, request_iterator, box_id: str) -> None:
        try:
            async for event in request_iterator:
                event_type, event_dict = self._event_to_dict(event)
                # Delegate ALL business logic to the handler
                await self._event_handler.execute(box_id, event_type, event_dict)
        except grpc_aio.AioRpcError:
            logger.info("Box %s gRPC stream ended", box_id)
        except Exception:
            logger.exception("Error reading events from box %s", box_id)

    async def _get_restore_messages(self, box_id: str) -> list[sandbox_pb2.ChatMessage]:
        """Load messages from repo and convert to protobuf."""
        messages = await self._repo.get_messages(box_id)
        proto_messages = []
        for m in messages:
            tool_calls = []
            if m.tool_calls:
                try:
                    tc_list = json.loads(m.tool_calls)
                    tool_calls = [
                        sandbox_pb2.ToolCall(
                            id=tc.get("id", ""),
                            name=tc.get("name", ""),
                            args_json=tc.get("args_json", ""),
                        )
                        for tc in tc_list
                    ]
                except (json.JSONDecodeError, TypeError):
                    pass
            proto_messages.append(sandbox_pb2.ChatMessage(
                role=m.role or "",
                content=m.content or "",
                tool_calls=tool_calls,
                tool_call_id=m.tool_call_id or "",
                tool_name=m.tool_name or "",
                metadata_json=m.metadata_json or "",
            ))
        return proto_messages

    # ------------------------------------------------------------------
    # Protobuf serialization helpers (copied verbatim from grpc/server.py)
    # ------------------------------------------------------------------

    def _event_to_dict(self, event: sandbox_pb2.SandboxEvent) -> tuple[str, dict[str, Any]]:
        """Convert a protobuf SandboxEvent to (event_type, dict)."""
        field = event.WhichOneof("event")
        if field is None:
            return "", {}

        if field == "register":
            return "register", {"type": "register", "session_id": event.register.session_id}
        elif field == "token":
            return "token", {"type": "token", "text": event.token.text}
        elif field == "model_start":
            return "model_start", {"type": "model_start"}
        elif field == "tool_start":
            ts = event.tool_start
            return "tool_start", {
                "type": "tool_start",
                "name": ts.name,
                "tool_call_id": ts.tool_call_id,
                "input": ts.input,
            }
        elif field == "tool_end":
            te = event.tool_end
            return "tool_end", {"type": "tool_end", "name": te.name, "output": te.output}
        elif field == "message_complete":
            mc = event.message_complete
            msg = self._chat_message_to_dict(mc.message)
            return "message_complete", {"type": "message_complete", "message": msg}
        elif field == "done":
            return "done", {"type": "done", "content": event.done.content}
        elif field == "error":
            return "error", {"type": "error", "detail": event.error.detail}
        elif field == "exec_output":
            eo = event.exec_output
            return "exec_output", {"type": "exec_output", "output": eo.output, "request_id": eo.request_id}
        elif field == "exec_done":
            ed = event.exec_done
            return "exec_done", {"type": "exec_done", "output": ed.output, "request_id": ed.request_id}
        elif field == "list_files_result":
            lfr = event.list_files_result
            result: dict[str, Any] = {"type": "list_files_result", "request_id": lfr.request_id}
            if lfr.error:
                result["error"] = lfr.error
            elif lfr.data_json:
                result["data"] = json.loads(lfr.data_json)
            return "list_files_result", result
        elif field == "read_file_result":
            rfr = event.read_file_result
            result = {"type": "read_file_result", "request_id": rfr.request_id}
            if rfr.error:
                result["error"] = rfr.error
            elif rfr.data_json:
                result["data"] = json.loads(rfr.data_json)
            return "read_file_result", result
        elif field == "task_status_changed":
            return "task_status_changed", {
                "type": "task_status_changed",
                "status": event.task_status_changed.status,
            }
        elif field == "report_status":
            rs = event.report_status
            return "report_status", {
                "type": "report_status",
                "status": rs.status,
                "message": rs.message,
            }
        return "", {}

    def _chat_message_to_dict(self, msg: sandbox_pb2.ChatMessage) -> dict[str, Any]:
        """Convert a ChatMessage protobuf to dict."""
        result: dict[str, Any] = {
            "role": msg.role,
            "content": msg.content,
        }
        if msg.tool_calls:
            result["tool_calls"] = [
                {"id": tc.id, "name": tc.name, "args_json": tc.args_json}
                for tc in msg.tool_calls
            ]
        if msg.tool_call_id:
            result["tool_call_id"] = msg.tool_call_id
        if msg.tool_name:
            result["tool_name"] = msg.tool_name
        if msg.metadata_json:
            result["metadata_json"] = msg.metadata_json
        return result

    def _dict_to_command(self, cmd: dict[str, Any]) -> sandbox_pb2.OrchestratorCommand:
        """Convert a command dict to an OrchestratorCommand protobuf."""
        cmd_type = cmd.get("type", "")
        if cmd_type == "message":
            return sandbox_pb2.OrchestratorCommand(
                message=sandbox_pb2.SendMessageCommand(content=cmd.get("content", ""))
            )
        elif cmd_type == "exec":
            return sandbox_pb2.OrchestratorCommand(
                exec=sandbox_pb2.ExecCommand(
                    content=cmd.get("content", ""),
                    request_id=cmd.get("request_id", ""),
                )
            )
        elif cmd_type == "cancel":
            return sandbox_pb2.OrchestratorCommand(
                cancel=sandbox_pb2.CancelCommand()
            )
        elif cmd_type == "list_files":
            return sandbox_pb2.OrchestratorCommand(
                list_files=sandbox_pb2.ListFilesCommand(
                    path=cmd.get("path", ""),
                    request_id=cmd.get("request_id", ""),
                )
            )
        elif cmd_type == "read_file":
            return sandbox_pb2.OrchestratorCommand(
                read_file=sandbox_pb2.ReadFileCommand(
                    path=cmd.get("path", ""),
                    request_id=cmd.get("request_id", ""),
                )
            )
        else:
            logger.warning("Unknown command type: %s", cmd_type)
            return sandbox_pb2.OrchestratorCommand()


async def start_grpc_server(
    port: int,
    event_handler: HandleSandboxEventHandler,
    registry: CallbackRegistry,
    repo: BoxRepository,
) -> grpc_aio.Server:
    """Create and start the gRPC server."""
    server = grpc_aio.server()
    servicer = SandboxServiceServicer(
        event_handler=event_handler,
        registry=registry,
        repo=repo,
    )
    sandbox_pb2_grpc.add_SandboxServiceServicer_to_server(servicer, server)
    server.add_insecure_port(f"[::]:{port}")
    await server.start()
    logger.info("gRPC server started on port %d", port)
    return server
