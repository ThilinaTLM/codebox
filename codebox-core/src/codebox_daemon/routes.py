"""REST API endpoints for session management."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from codebox_daemon.auth import require_auth
from codebox_daemon.schemas import (
    CreateSessionRequest,
    SessionInfo,
    SessionListResponse,
)
from codebox_daemon.sessions import SessionManager

router = APIRouter(prefix="/api/v1")


def _get_manager(request: Request) -> SessionManager:
    """Extract the SessionManager from app state."""
    return request.app.state.session_manager


@router.get("/health")
async def health() -> dict:
    """Health check endpoint (no auth required)."""
    return {"status": "ok", "version": "0.1.0"}


@router.post(
    "/sessions",
    response_model=SessionInfo,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_auth)],
)
async def create_session(
    body: CreateSessionRequest,
    manager: SessionManager = Depends(_get_manager),
) -> SessionInfo:
    """Create a new agent session."""
    model = body.model or os.environ.get("OPENROUTER_MODEL", "")
    api_key = body.api_key or os.environ.get("OPENROUTER_API_KEY", "")

    if not model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="model is required (via request body or OPENROUTER_MODEL env var)",
        )
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="api_key is required (via request body or OPENROUTER_API_KEY env var)",
        )

    session = manager.create(
        model=model,
        api_key=api_key,
        system_prompt=body.system_prompt,
        working_dir=body.working_dir,
    )
    return SessionInfo(
        session_id=session.session_id,
        created_at=session.created_at,
        last_active_at=session.last_active_at,
        model=session.model,
        message_count=len(session.messages),
    )


@router.get(
    "/sessions",
    response_model=SessionListResponse,
    dependencies=[Depends(require_auth)],
)
async def list_sessions(
    manager: SessionManager = Depends(_get_manager),
) -> SessionListResponse:
    """List all active sessions."""
    sessions = manager.list()
    return SessionListResponse(
        sessions=[
            SessionInfo(
                session_id=s.session_id,
                created_at=s.created_at,
                last_active_at=s.last_active_at,
                model=s.model,
                message_count=len(s.messages),
            )
            for s in sessions
        ]
    )


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_auth)],
)
async def delete_session(
    session_id: str,
    manager: SessionManager = Depends(_get_manager),
) -> Response:
    """Delete a session by ID."""
    try:
        manager.delete(session_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session not found: {session_id}",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
