"""In-memory session manager for agent sessions."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from codebox_agent.agent import create_agent
from codebox_agent.tools.status import StatusReporter

if TYPE_CHECKING:
    import asyncio

logger = logging.getLogger(__name__)


@dataclass
class Session:
    """A single agent session with its state."""

    session_id: str
    agent: Any  # compiled LangGraph graph
    checkpointer: AsyncSqliteSaver
    created_at: datetime
    model: str
    status_reporter: StatusReporter = field(default_factory=StatusReporter)
    recursion_limit: int = 150
    current_task: asyncio.Task | None = field(default=None, repr=False)


class SessionManager:
    """Manages creation, retrieval, and deletion of agent sessions."""

    def __init__(self, checkpoint_db_path: str = "/tmp/codebox-checkpoints.db") -> None:  # noqa: S108
        self._sessions: dict[str, Session] = {}
        self._checkpoint_db_path = checkpoint_db_path

    async def create(
        self,
        model: str,
        api_key: str,
        environment_system_prompt: str | None = None,
        dynamic_system_prompt: str | None = None,
        working_dir: str = "/workspace",
        sandbox_config: dict | None = None,
    ) -> Session:
        """Create a new session with a fresh agent and checkpointer.

        Args:
            model: The OpenRouter model identifier.
            api_key: The OpenRouter API key.
            environment_system_prompt: Optional runner-specific environment prompt.
            dynamic_system_prompt: Optional caller-provided prompt appended after
                the environment prompt.
            working_dir: Root directory for the shell backend.
            sandbox_config: Optional dict with keys: temperature, timeout, recursion_limit.

        Returns:
            The newly created Session.
        """
        session_id = str(uuid.uuid4())
        logger.info(
            "Creating session %s: model=%s, working_dir=%s", session_id, model, working_dir
        )

        # Ensure checkpoint directory exists
        Path(self._checkpoint_db_path).parent.mkdir(parents=True, exist_ok=True)

        logger.debug("Opening checkpoint DB at %s", self._checkpoint_db_path)
        conn = await aiosqlite.connect(self._checkpoint_db_path)
        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()

        status_reporter = StatusReporter()
        agent = create_agent(
            model=model,
            api_key=api_key,
            environment_system_prompt=environment_system_prompt,
            dynamic_system_prompt=dynamic_system_prompt,
            root_dir=working_dir,
            sandbox_config=sandbox_config,
            checkpointer=checkpointer,
            status_reporter=status_reporter,
        )
        cfg = sandbox_config or {}
        recursion_limit = cfg.get("recursion_limit", 150)
        now = datetime.now(UTC)
        session = Session(
            session_id=session_id,
            agent=agent,
            checkpointer=checkpointer,
            created_at=now,
            model=model,
            status_reporter=status_reporter,
            recursion_limit=recursion_limit,
        )
        self._sessions[session_id] = session
        logger.info(
            "Session %s created: recursion_limit=%d",
            session_id,
            recursion_limit,
        )
        return session

    def get(self, session_id: str) -> Session:
        """Retrieve a session by ID.

        Raises:
            KeyError: If the session does not exist.
        """
        try:
            return self._sessions[session_id]
        except KeyError:
            raise KeyError(f"Session not found: {session_id}") from None

    def delete(self, session_id: str) -> None:
        """Delete a session by ID.

        Raises:
            KeyError: If the session does not exist.
        """
        if session_id not in self._sessions:
            raise KeyError(f"Session not found: {session_id}")
        session = self._sessions.pop(session_id)
        cancelled = False
        if session.current_task and not session.current_task.done():
            session.current_task.cancel()
            cancelled = True
        logger.info("Session %s deleted (task_cancelled=%s)", session_id, cancelled)

    def list(self) -> list[Session]:
        """Return all active sessions."""
        return list(self._sessions.values())
