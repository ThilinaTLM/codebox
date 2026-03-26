"""In-memory session manager for agent sessions."""

from __future__ import annotations

import asyncio
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from codebox_daemon.agent import create_agent

_CHECKPOINT_DB_PATH = "/workspace/.codebox/checkpoints.db"


@dataclass
class Session:
    """A single agent session with its state."""

    session_id: str
    agent: Any  # compiled LangGraph graph
    checkpointer: AsyncSqliteSaver
    created_at: datetime
    last_active_at: datetime
    model: str
    recursion_limit: int = 150
    current_task: asyncio.Task | None = field(default=None, repr=False)


class SessionManager:
    """Manages creation, retrieval, and deletion of agent sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    async def create(
        self,
        model: str,
        api_key: str,
        secondary_system_prompt: str | None = None,
        working_dir: str = "/workspace",
        sandbox_config: dict | None = None,
    ) -> Session:
        """Create a new session with a fresh agent and checkpointer.

        Args:
            model: The OpenRouter model identifier.
            api_key: The OpenRouter API key.
            secondary_system_prompt: Optional task-specific prompt appended to
                the primary environment prompt.
            working_dir: Root directory for the shell backend.
            sandbox_config: Optional dict with keys: temperature, timeout, recursion_limit.

        Returns:
            The newly created Session.
        """
        session_id = str(uuid.uuid4())

        # Ensure checkpoint directory exists
        os.makedirs(os.path.dirname(_CHECKPOINT_DB_PATH), exist_ok=True)

        conn = await aiosqlite.connect(_CHECKPOINT_DB_PATH)
        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()

        agent = create_agent(
            model=model,
            api_key=api_key,
            secondary_system_prompt=secondary_system_prompt,
            root_dir=working_dir,
            sandbox_config=sandbox_config,
            checkpointer=checkpointer,
        )
        cfg = sandbox_config or {}
        recursion_limit = cfg.get("recursion_limit", 150)
        now = datetime.now(timezone.utc)
        session = Session(
            session_id=session_id,
            agent=agent,
            checkpointer=checkpointer,
            created_at=now,
            last_active_at=now,
            model=model,
            recursion_limit=recursion_limit,
        )
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Session:
        """Retrieve a session by ID.

        Raises:
            KeyError: If the session does not exist.
        """
        try:
            return self._sessions[session_id]
        except KeyError:
            raise KeyError(f"Session not found: {session_id}")

    def delete(self, session_id: str) -> None:
        """Delete a session by ID.

        Raises:
            KeyError: If the session does not exist.
        """
        if session_id not in self._sessions:
            raise KeyError(f"Session not found: {session_id}")
        session = self._sessions.pop(session_id)
        if session.current_task and not session.current_task.done():
            session.current_task.cancel()

    def list(self) -> list[Session]:
        """Return all active sessions."""
        return list(self._sessions.values())
