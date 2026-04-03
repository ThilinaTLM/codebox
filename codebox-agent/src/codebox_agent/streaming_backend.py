"""Streaming-aware shell backend.

Overrides ``aexecute`` so that shell output is emitted line-by-line
through LangGraph's ``get_stream_writer`` while the command is still
running.  The full output is still returned in the ``ExecuteResponse``
so the LLM sees the complete result.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

from deepagents.backends import LocalShellBackend
from deepagents.backends.protocol import ExecuteResponse

logger = logging.getLogger(__name__)


class StreamingShellBackend(LocalShellBackend):
    """Shell backend that streams execute output via LangGraph custom events."""

    async def aexecute(
        self,
        command: str,
        *,
        timeout: int | None = None,  # noqa: ASYNC109
    ) -> ExecuteResponse:
        """Execute *command* and stream stdout lines through ``get_stream_writer``.

        Falls back to the parent (blocking) implementation when the
        stream writer is unavailable (e.g. outside a graph context).
        """
        try:
            from langgraph.config import get_stream_writer  # noqa: PLC0415

            writer = get_stream_writer()
        except Exception:
            # Not running inside a LangGraph node - use default behaviour.
            return await super().aexecute(command, timeout=timeout)

        effective_timeout = timeout if timeout is not None else self._default_timeout

        output_parts: list[str] = []
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(self.cwd),
                env=self._env,
            )

            async def _read_output() -> None:
                assert proc.stdout is not None
                async for raw_line in proc.stdout:
                    decoded = raw_line.decode(errors="replace")
                    output_parts.append(decoded)
                    with contextlib.suppress(Exception):
                        writer({"type": "tool_exec_output", "line": decoded})

            try:
                await asyncio.wait_for(
                    _read_output(),
                    timeout=effective_timeout if effective_timeout > 0 else None,
                )
                await proc.wait()
            except TimeoutError:
                proc.kill()
                await proc.wait()
                output = "".join(output_parts)
                output += f"\n\nError: Command timed out after {effective_timeout} seconds."
                return ExecuteResponse(output=output, exit_code=124, truncated=False)

            output = "".join(output_parts) or "<no output>"

            truncated = False
            if len(output) > self._max_output_bytes:
                output = output[: self._max_output_bytes]
                output += f"\n\n... Output truncated at {self._max_output_bytes} bytes."
                truncated = True

            exit_code = proc.returncode or 0
            if exit_code != 0:
                output = f"{output.rstrip()}\n\nExit code: {exit_code}"

            return ExecuteResponse(
                output=output,
                exit_code=exit_code,
                truncated=truncated,
            )

        except Exception:
            logger.debug("Streaming execute failed, falling back", exc_info=True)
            return await super().aexecute(command, timeout=timeout)
