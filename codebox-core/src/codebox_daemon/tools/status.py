"""Agent self-report status tool."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from langchain_core.tools import BaseTool, StructuredTool

logger = logging.getLogger(__name__)

VALID_STATUSES = {
    "completed",
    "in_progress",
    "need_clarification",
    "unable_to_proceed",
    "not_enough_context",
}

SendFn = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


class StatusReporter:
    """Mutable holder for the send function, injected after gRPC connects."""

    def __init__(self) -> None:
        self.send_fn: SendFn | None = None


def build_status_tools(reporter: StatusReporter) -> list[BaseTool]:
    """Build the set_status tool that lets the agent self-report its progress."""

    async def _set_status_async(
        status: Annotated[str, "One of: completed, in_progress, need_clarification, unable_to_proceed, not_enough_context"],
        message: Annotated[str | None, "Optional explanation"] = None,
    ) -> str:
        if status not in VALID_STATUSES:
            return f"Error: Invalid status '{status}'. Must be one of: {', '.join(sorted(VALID_STATUSES))}"

        if reporter.send_fn is None:
            logger.warning("set_status called but send_fn not yet available")
            return "Error: Status reporting not yet connected."

        event = {"type": "report_status", "status": status, "message": message or ""}
        await reporter.send_fn(event)
        logger.info("set_status: status=%s message=%r", status, message)
        return f"Status set to '{status}'." + (f" Message: {message}" if message else "")

    def _set_status_sync(
        status: Annotated[str, "One of: completed, in_progress, need_clarification, unable_to_proceed, not_enough_context"],
        message: Annotated[str | None, "Optional explanation"] = None,
    ) -> str:
        """Set the agent's feedback status to communicate progress to the user.

        Call this tool to report your current status:
        - "completed": You believe the task is done
        - "in_progress": Work started but not finished
        - "need_clarification": You need user input to continue
        - "unable_to_proceed": You are stuck or blocked
        - "not_enough_context": You need more information

        Args:
            status: One of: completed, in_progress, need_clarification, unable_to_proceed, not_enough_context
            message: Optional explanation (e.g. "PR opened at ...", "Need access to the database credentials")
        """
        loop = asyncio.get_event_loop()
        if loop.is_running():
            future = asyncio.ensure_future(_set_status_async(status, message))
            # Return immediately — the event will be sent async
            return f"Status set to '{status}'." + (f" Message: {message}" if message else "")
        return asyncio.run(_set_status_async(status, message))

    return [
        StructuredTool.from_function(
            name="set_status",
            description=_set_status_sync.__doc__,
            func=_set_status_sync,
            coroutine=_set_status_async,
        ),
    ]
