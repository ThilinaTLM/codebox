"""Global WebSocket endpoint for platform-level events (box lifecycle)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from codebox_orchestrator.services.global_broadcast_service import GlobalBroadcastService

router = APIRouter()


@router.websocket("/api/ws")
async def global_websocket(ws: WebSocket) -> None:
    """Push box lifecycle events to all connected clients."""
    await ws.accept()

    global_broadcast: GlobalBroadcastService = ws.app.state.global_broadcast
    queue = global_broadcast.subscribe()

    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                await ws.send_json({"type": "ping"})
                continue
            await ws.send_json(event)
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        global_broadcast.unsubscribe(queue)
