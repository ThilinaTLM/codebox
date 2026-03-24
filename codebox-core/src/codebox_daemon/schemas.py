"""Pydantic v2 request/response models and WebSocket frame schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class CreateSessionRequest(BaseModel):
    """Request body for creating a new agent session."""

    model: str | None = None  # defaults to env
    api_key: str | None = None  # defaults to env
    system_prompt: str | None = None
    working_dir: str = "/workspace"


class SessionInfo(BaseModel):
    """Public information about an agent session."""

    session_id: str
    created_at: datetime
    last_active_at: datetime
    model: str
    message_count: int


class SessionListResponse(BaseModel):
    """Response for listing all active sessions."""

    sessions: list[SessionInfo]


# --- WebSocket frame models ---


class WSClientMessage(BaseModel):
    """Message sent from the client over WebSocket."""

    type: Literal["message", "cancel", "exec"]
    content: str | None = None


class WSServerMessage(BaseModel):
    """Message sent from the server over WebSocket."""

    type: Literal["model_start", "tool_start", "tool_end", "token", "done", "error", "exec_output", "exec_done"]
    name: str | None = None
    tool_call_id: str | None = None
    output: str | None = None
    text: str | None = None
    content: str | None = None
    detail: str | None = None
