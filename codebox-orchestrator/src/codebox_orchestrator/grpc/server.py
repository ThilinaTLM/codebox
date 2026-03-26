"""gRPC server for sandbox ↔ orchestrator communication.

Implements the SandboxService.Connect bidirectional streaming RPC,
replacing the WebSocket callback handler.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import grpc
from grpc import aio as grpc_aio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from codebox_orchestrator.db.models import Box, BoxEvent, BoxMessage, BoxStatus
from codebox_orchestrator.grpc.generated.codebox.sandbox import sandbox_pb2, sandbox_pb2_grpc
from codebox_orchestrator.services.callback_registry import CallbackRegistry, ConnectionHandle
from codebox_orchestrator.services.callback_token import decode_callback_token
from codebox_orchestrator.services.global_broadcast_service import GlobalBroadcastService
from codebox_orchestrator.services.relay_service import RelayService

logger = logging.getLogger(__name__)


class SandboxServiceServicer(sandbox_pb2_grpc.SandboxServiceServicer):
    """Handles bidirectional streaming connections from sandbox containers."""

    def __init__(
        self,
        session_factory: async_sessionmaker,
        relay: RelayService,
        registry: CallbackRegistry,
        global_broadcast: GlobalBroadcastService,
    ) -> None:
        self._sf = session_factory
        self._relay = relay
        self._registry = registry
        self._global_broadcast = global_broadcast

    async def Connect(
        self,
        request_iterator: AsyncIterator[sandbox_pb2.SandboxEvent],
        context: grpc_aio.ServicerContext,
    ) -> AsyncIterator[sandbox_pb2.OrchestratorCommand]:
        """Handle a sandbox container's bidirectional stream."""
        # Extract auth token from metadata
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

        # Reject connections for boxes in terminal states
        async with self._sf() as db:
            box = await db.get(Box, entity_id)
            if box is None or box.status in (
                BoxStatus.COMPLETED, BoxStatus.FAILED,
                BoxStatus.CANCELLED, BoxStatus.STOPPED,
            ):
                await context.abort(grpc.StatusCode.FAILED_PRECONDITION, "Box is in terminal state")
                return

        logger.info("gRPC connection from %s %s", entity_type, entity_id)

        # Close existing stale connection if any
        old_conn = self._registry.get_connection(entity_id)
        if old_conn is not None:
            logger.info("Replacing stale connection for %s", entity_id)
            self._registry.remove(entity_id)

        self._registry.init_connection_state(entity_id)

        # Wait for RegisterEvent as first message
        try:
            first_event = await request_iterator.__anext__()
        except (StopAsyncIteration, grpc_aio.AioRpcError):
            logger.warning("Box %s disconnected during registration", entity_id)
            return

        if not first_event.HasField("register"):
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "Expected RegisterEvent")
            return

        session_id = first_event.register.session_id

        # Create connection handle and register it
        handle = ConnectionHandle()
        self._registry.set_connection(entity_id, handle)

        # Store session_id on the box
        async with self._sf() as db:
            box = await db.get(Box, entity_id)
            if box:
                box.session_id = session_id
                await db.commit()

        auto_stop = await self._get_auto_stop(entity_id)

        logger.info("Box %s registered via gRPC (session %s)", entity_id, session_id)

        # Send RegisteredCommand
        yield sandbox_pb2.OrchestratorCommand(
            registered=sandbox_pb2.RegisteredCommand()
        )

        # Send ThreadRestoreCommand if there are existing messages
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

        # Start two concurrent tasks:
        # 1. Read events from sandbox and process them
        # 2. Read commands from the handle queue and yield them
        event_reader_task = asyncio.create_task(
            self._read_events(request_iterator, entity_id, auto_stop)
        )

        try:
            while not context.cancelled():
                # Check if event reader finished (disconnected or terminal event)
                if event_reader_task.done():
                    # Drain remaining commands
                    while not handle.command_queue.empty():
                        cmd = handle.command_queue.get_nowait()
                        yield self._dict_to_command(cmd)
                    break

                # Wait for command or event reader completion
                try:
                    cmd = await asyncio.wait_for(
                        handle.command_queue.get(), timeout=1.0
                    )
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
            logger.info("gRPC connection closed for box %s", entity_id)

    async def _read_events(
        self,
        request_iterator: AsyncIterator[sandbox_pb2.SandboxEvent],
        box_id: str,
        auto_stop: bool,
    ) -> None:
        """Read and process events from the sandbox container."""
        try:
            async for event in request_iterator:
                await self._handle_event(event, box_id, auto_stop)
        except grpc_aio.AioRpcError:
            logger.info("Box %s gRPC stream ended", box_id)
        except Exception:
            logger.exception("Error reading events from box %s", box_id)

    async def _handle_event(
        self,
        event: sandbox_pb2.SandboxEvent,
        box_id: str,
        auto_stop: bool,
    ) -> None:
        """Process a single sandbox event."""
        event_type, event_dict = self._event_to_dict(event)

        if not event_type:
            return

        # Handle file-op responses
        if event_type in ("list_files_result", "read_file_result"):
            request_id = event_dict.get("request_id", "")
            self._registry.resolve_pending_request(box_id, request_id, event_dict)
            return

        # Resolve exec_done pending requests
        if event_type == "exec_done":
            request_id = event_dict.get("request_id", "")
            if request_id:
                self._registry.resolve_pending_request(box_id, request_id, event_dict)

        # Persist structured message
        if event_type == "message_complete":
            msg_data = event_dict.get("message", {})
            await self._persist_box_message(box_id, msg_data)

        # Persist event
        await self._persist_box_event(box_id, event_type, event_dict)

        # Broadcast to subscribers
        await self._relay.broadcast(box_id, event_dict)

        # Handle terminal events
        if event_type == "done":
            if auto_stop:
                content = event_dict.get("content", "")
                await self._set_box_completed(box_id, content)
                self._registry.remove_fully(box_id)
            else:
                await self._set_box_idle(box_id)
        elif event_type == "error":
            detail = event_dict.get("detail", "Unknown error")
            await self._set_box_failed(box_id, detail)
            self._registry.remove_fully(box_id)

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

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    async def _get_auto_stop(self, box_id: str) -> bool:
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            return box.auto_stop if box else True

    async def _persist_box_event(
        self, box_id: str, event_type: str, data: dict[str, Any]
    ) -> None:
        async with self._sf() as db:
            ev = BoxEvent(
                box_id=box_id,
                event_type=event_type,
                data=json.dumps(data),
            )
            db.add(ev)
            await db.commit()

    async def _persist_box_message(
        self, box_id: str, msg_data: dict[str, Any]
    ) -> None:
        async with self._sf() as db:
            result = await db.execute(
                select(func.coalesce(func.max(BoxMessage.seq), 0))
                .where(BoxMessage.box_id == box_id)
            )
            max_seq = result.scalar()
            next_seq = max_seq + 1

            tool_calls = msg_data.get("tool_calls")
            tool_calls_json = json.dumps(tool_calls) if tool_calls else None

            bm = BoxMessage(
                box_id=box_id,
                seq=next_seq,
                role=msg_data.get("role", ""),
                content=msg_data.get("content"),
                tool_calls=tool_calls_json,
                tool_call_id=msg_data.get("tool_call_id"),
                tool_name=msg_data.get("tool_name"),
                metadata_json=msg_data.get("metadata_json"),
            )
            db.add(bm)
            await db.commit()

    async def _get_restore_messages(self, box_id: str) -> list[sandbox_pb2.ChatMessage]:
        """Load box_messages and convert to protobuf ChatMessage list."""
        async with self._sf() as db:
            result = await db.execute(
                select(BoxMessage)
                .where(BoxMessage.box_id == box_id)
                .order_by(BoxMessage.seq)
            )
            messages = result.scalars().all()

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

    async def _set_box_completed(self, box_id: str, content: str) -> None:
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box:
                box.status = BoxStatus.COMPLETED
                box.result_summary = content
                box.completed_at = datetime.now(timezone.utc)
                await db.commit()
        await self._relay.broadcast(
            box_id, {"type": "status_change", "status": BoxStatus.COMPLETED.value}
        )
        await self._global_broadcast.broadcast({
            "type": "box_status_changed",
            "box_id": box_id,
            "status": BoxStatus.COMPLETED.value,
        })

    async def _set_box_idle(self, box_id: str) -> None:
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box:
                box.status = BoxStatus.IDLE
                await db.commit()
        await self._relay.broadcast(
            box_id, {"type": "status_change", "status": BoxStatus.IDLE.value}
        )
        await self._global_broadcast.broadcast({
            "type": "box_status_changed",
            "box_id": box_id,
            "status": BoxStatus.IDLE.value,
        })

    async def _set_box_failed(self, box_id: str, error: str) -> None:
        async with self._sf() as db:
            box = await db.get(Box, box_id)
            if box:
                box.status = BoxStatus.FAILED
                box.error_message = error
                box.completed_at = datetime.now(timezone.utc)
                await db.commit()
        await self._relay.broadcast(
            box_id, {"type": "status_change", "status": BoxStatus.FAILED.value}
        )
        await self._relay.broadcast(
            box_id, {"type": "error", "detail": error}
        )
        await self._global_broadcast.broadcast({
            "type": "box_status_changed",
            "box_id": box_id,
            "status": BoxStatus.FAILED.value,
        })


async def start_grpc_server(
    port: int,
    session_factory: async_sessionmaker,
    relay: RelayService,
    registry: CallbackRegistry,
    global_broadcast: GlobalBroadcastService,
) -> grpc_aio.Server:
    """Create and start the gRPC server."""
    server = grpc_aio.server()
    servicer = SandboxServiceServicer(
        session_factory=session_factory,
        relay=relay,
        registry=registry,
        global_broadcast=global_broadcast,
    )
    sandbox_pb2_grpc.add_SandboxServiceServicer_to_server(servicer, server)
    server.add_insecure_port(f"[::]:{port}")
    await server.start()
    logger.info("gRPC server started on port %d", port)
    return server
