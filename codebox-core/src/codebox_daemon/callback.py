"""Callback client: connects outbound to the orchestrator via WebSocket.

On startup, creates a session locally, then connects to the orchestrator's
callback endpoint and enters a bidirectional message loop.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import websockets
import websockets.asyncio.client

from codebox_daemon.agent_runner import (
    handle_list_files,
    handle_read_file,
    run_agent_stream,
    run_exec,
)
from codebox_daemon.sessions import SessionManager

logger = logging.getLogger(__name__)

_RECONNECT_BASE_DELAY = 1.0
_RECONNECT_MAX_DELAY = 30.0


async def run_callback() -> None:
    """Main entry point for callback mode."""
    callback_url = os.environ.get("ORCHESTRATOR_CALLBACK_URL", "")
    callback_token = os.environ.get("CALLBACK_TOKEN", "")
    model = os.environ.get("OPENROUTER_MODEL", "")
    api_key = os.environ.get("OPENROUTER_API_KEY", "")

    if not callback_url:
        raise RuntimeError("ORCHESTRATOR_CALLBACK_URL is required")
    if not callback_token:
        raise RuntimeError("CALLBACK_TOKEN is required")
    if not model:
        raise RuntimeError("OPENROUTER_MODEL is required")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required")

    # Parse optional sandbox config from environment
    sandbox_config: dict[str, Any] | None = None
    sandbox_config_raw = os.environ.get("CODEBOX_SANDBOX_CONFIG")
    if sandbox_config_raw:
        sandbox_config = json.loads(sandbox_config_raw)

    # Create session manager and session
    manager = SessionManager()
    secondary_system_prompt = os.environ.get("SYSTEM_PROMPT")
    session = manager.create(
        model=model,
        api_key=api_key,
        secondary_system_prompt=secondary_system_prompt,
        sandbox_config=sandbox_config,
    )
    session_id = session.session_id
    logger.info("Created session %s with model %s", session_id, model)

    # Build the full callback URL
    ws_url = f"{callback_url}/api/internal/sandbox/connect?token={callback_token}"

    delay = _RECONNECT_BASE_DELAY
    while True:
        try:
            await _connect_and_run(ws_url, session_id, manager)
            # Clean exit (orchestrator closed connection gracefully)
            break
        except (
            websockets.exceptions.ConnectionClosed,
            websockets.exceptions.InvalidStatusCode,
            ConnectionRefusedError,
            OSError,
        ) as exc:
            logger.warning(
                "Connection to orchestrator lost (%s), retrying in %.1fs",
                exc, delay,
            )
            await asyncio.sleep(delay)
            delay = min(delay * 2, _RECONNECT_MAX_DELAY)
        except Exception:
            logger.exception("Unexpected error in callback loop")
            await asyncio.sleep(delay)
            delay = min(delay * 2, _RECONNECT_MAX_DELAY)


async def _connect_and_run(
    ws_url: str,
    session_id: str,
    manager: SessionManager,
) -> None:
    """Connect to orchestrator and run the message loop."""
    logger.info("Connecting to orchestrator at %s", ws_url.split("?")[0])

    async with websockets.connect(ws_url) as ws:
        # Register with orchestrator
        await ws.send(json.dumps({
            "type": "register",
            "session_id": session_id,
        }))

        # Wait for acknowledgment
        raw = await ws.recv()
        ack = json.loads(raw)
        if ack.get("type") != "registered":
            raise RuntimeError(f"Unexpected registration response: {ack}")

        logger.info("Registered with orchestrator, session %s", session_id)

        # Create send callback that writes to the WS
        async def send(msg: dict) -> None:
            try:
                await ws.send(json.dumps(msg))
            except Exception:
                pass

        # Message loop — long-running tasks (agent, exec) run as background
        # tasks so the loop stays responsive to file-op and cancel messages.
        current_task: asyncio.Task | None = None

        async def _cancel_current() -> None:
            nonlocal current_task
            if current_task and not current_task.done():
                current_task.cancel()
                try:
                    await current_task
                except (asyncio.CancelledError, Exception):
                    pass
            current_task = None

        def _on_task_done(task: asyncio.Task) -> None:
            nonlocal current_task
            session = manager.get(session_id)
            if current_task is task:
                current_task = None
                session.current_task = None

        try:
            async for raw_msg in ws:
                msg = json.loads(raw_msg)
                msg_type = msg.get("type", "")

                session = manager.get(session_id)

                if msg_type == "message":
                    content = msg.get("content", "")
                    if not content:
                        await send({"type": "error", "detail": "Empty message content"})
                        continue

                    await _cancel_current()
                    session.messages.append({"role": "user", "content": content})

                    current_task = asyncio.create_task(
                        run_agent_stream(send, session_id, manager)
                    )
                    session.current_task = current_task
                    current_task.add_done_callback(_on_task_done)

                elif msg_type == "exec":
                    command = msg.get("content", "")
                    if not command:
                        await send({"type": "error", "detail": "Empty exec command"})
                        continue

                    await _cancel_current()
                    current_task = asyncio.create_task(
                        run_exec(send, command, session_id)
                    )
                    session.current_task = current_task
                    current_task.add_done_callback(_on_task_done)

                elif msg_type == "cancel":
                    await _cancel_current()
                    session.current_task = None
                    logger.info("Cancelled running task for session %s", session_id)

                elif msg_type == "list_files":
                    path = msg.get("path", "/workspace")
                    request_id = msg.get("request_id", "")
                    await handle_list_files(send, path, request_id)

                elif msg_type == "read_file":
                    path = msg.get("path", "")
                    request_id = msg.get("request_id", "")
                    await handle_read_file(send, path, request_id)

                else:
                    await send({"type": "error", "detail": f"Unknown message type: {msg_type}"})
        finally:
            await _cancel_current()
