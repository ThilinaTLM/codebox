"""PTY server — spawns an interactive shell backed by a real pty for each
incoming stream.

Listens on ``127.0.0.1:PTY_SERVER_PORT`` (localhost only) and is reached
exclusively through the yamux tunnel (never exposed externally).  Each
accepted connection speaks the length-prefixed frame protocol defined in
``codebox_tunnel.pty_frames``.

Design notes
------------

* **One shell per connection.**  Sessions do not survive stream close;
  reconnecting the browser starts a fresh ``bash``.  This matches the
  v1 product decision and keeps the server stateless.

* **Env sanitization.**  The child shell inherits a minimal,
  allow-listed environment — secrets (``*_API_KEY``, ``*_TOKEN``,
  ``*_SECRET``, ``CODEBOX_*``) are stripped to avoid leaking orchestrator
  credentials to anything the user types.

* **Process group.**  The child is started via ``os.setsid`` in a
  ``preexec_fn`` so signalling the pgid kills foreground and background
  jobs together when the stream closes.
"""

from __future__ import annotations

import asyncio
import contextlib
import fcntl
import json
import logging
import os
import signal
import struct
import termios
from pathlib import Path
from pty import openpty
from typing import TYPE_CHECKING, Any

from codebox_tunnel.protocol import PTY_SERVER_PORT
from codebox_tunnel.pty_frames import PTYFrameType, read_frame, write_frame

if TYPE_CHECKING:
    from asyncio.subprocess import Process

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_DEFAULT_SHELL = "/bin/bash"
_DEFAULT_CWD = "/workspace"
_DEFAULT_COLS = 80
_DEFAULT_ROWS = 24
_READ_CHUNK = 4096
_TERM_GRACE_SECONDS = 2.0
_MAX_DIMENSION = 1000

_ALLOWED_SHELLS = frozenset({"/bin/bash", "/bin/sh", "/usr/bin/bash", "/usr/bin/sh", "/bin/zsh"})

# Env vars allowed to pass through as-is (in addition to the hard-coded
# values we set).  Everything else is stripped.
#
# ``GH_TOKEN`` is the GitHub App installation token injected by the
# orchestrator for GitHub-bound boxes.  It is already persisted in
# plaintext to ``~/.gitconfig`` by the box setup commands (see
# ``setup_commands.build_setup_commands``), so stripping it from the PTY
# env would not actually protect it — it would only break ``gh`` CLI
# usage in the terminal.  Other token-shaped env vars (LLM API keys,
# callback JWTs, ``TAVILY_API_KEY``) are *not* on disk and remain
# stripped by ``_SECRET_PATTERNS`` below.
_ENV_ALLOWLIST = frozenset(
    {
        "PATH",
        "HOME",
        "USER",
        "LOGNAME",
        "LANG",
        "LC_ALL",
        "TZ",
        "SHELL",
        "GH_TOKEN",
    }
)

# Patterns (substring match against var name, uppercased) that mark a var
# as sensitive even if it somehow slipped past allow-list logic.  Belt and
# braces — the allow-list is what actually does the filtering.
_SECRET_PATTERNS = ("API_KEY", "TOKEN", "SECRET", "PASSWORD", "PASSWD", "CODEBOX_")

# Allow-listed vars that are intentionally exempt from ``_SECRET_PATTERNS``.
# See the comment on ``_ENV_ALLOWLIST`` for the rationale for each entry.
_SECRET_PATTERN_EXEMPT = frozenset({"GH_TOKEN"})


def _sanitized_env() -> dict[str, str]:
    """Build the child-process environment.

    Starts from ``os.environ`` filtered to the allow-list, then forces
    the terminal-relevant variables regardless of what the parent has.
    """
    env: dict[str, str] = {}
    for key, value in os.environ.items():
        if key not in _ENV_ALLOWLIST:
            continue
        if key not in _SECRET_PATTERN_EXEMPT and any(p in key.upper() for p in _SECRET_PATTERNS):
            continue
        env[key] = value

    # Hard defaults — filled in only when not already provided.
    env.setdefault("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
    env.setdefault("HOME", os.environ.get("HOME", "/root"))
    env.setdefault("USER", os.environ.get("USER", "root"))
    env["LANG"] = env.get("LANG") or "C.UTF-8"
    env["TERM"] = "xterm-256color"
    return env


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    """Set the PTY window size via ``TIOCSWINSZ``."""
    # struct winsize: ushort ws_row, ws_col, ws_xpixel, ws_ypixel.
    winsize = struct.pack("HHHH", max(1, rows), max(1, cols), 0, 0)
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except OSError:
        logger.debug("TIOCSWINSZ failed", exc_info=True)


def _parse_open_payload(payload: bytes) -> tuple[int, int, str, str]:
    """Parse an ``OPEN`` frame payload.  Returns ``(cols, rows, shell, cwd)``."""
    try:
        data: Any = json.loads(payload or b"{}")
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid OPEN JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("OPEN payload must be a JSON object")  # noqa: TRY004

    cols = max(1, min(int(data.get("cols") or _DEFAULT_COLS), _MAX_DIMENSION))
    rows = max(1, min(int(data.get("rows") or _DEFAULT_ROWS), _MAX_DIMENSION))
    shell = str(data.get("shell") or _DEFAULT_SHELL)
    cwd = str(data.get("cwd") or _DEFAULT_CWD)

    # Refuse to spawn an arbitrary binary — allow only common shell paths.
    # This prevents a malicious client from turning the PTY server into a
    # generic exec primitive.
    if shell not in _ALLOWED_SHELLS:
        logger.warning("Refused OPEN shell=%r; falling back to %s", shell, _DEFAULT_SHELL)
        shell = _DEFAULT_SHELL

    if not Path(cwd).is_dir():
        logger.debug("OPEN cwd %s not a directory, falling back to %s", cwd, _DEFAULT_CWD)
        cwd = _DEFAULT_CWD

    return cols, rows, shell, cwd


def _parse_resize_payload(payload: bytes) -> tuple[int, int]:
    try:
        data: Any = json.loads(payload or b"{}")
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid RESIZE JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("RESIZE payload must be a JSON object")  # noqa: TRY004
    cols = max(1, min(int(data.get("cols") or _DEFAULT_COLS), _MAX_DIMENSION))
    rows = max(1, min(int(data.get("rows") or _DEFAULT_ROWS), _MAX_DIMENSION))
    return cols, rows


async def _safe_write_frame(
    writer: asyncio.StreamWriter, ftype: int, payload: bytes = b""
) -> bool:
    """Write a frame, swallowing connection-closed errors.

    Returns ``True`` on success, ``False`` if the peer has closed.
    """
    try:
        await write_frame(writer, ftype, payload)
    except (ConnectionResetError, BrokenPipeError):
        return False
    return True


def _exit_payload(exit_code: int, signal_num: int | None) -> bytes:
    return json.dumps({"exit_code": exit_code, "signal": signal_num}).encode()


async def _reject_and_close(writer: asyncio.StreamWriter) -> None:
    """Send a generic failure EXIT and close the writer."""
    await _safe_write_frame(writer, PTYFrameType.EXIT, _exit_payload(-1, None))
    writer.close()
    with contextlib.suppress(ConnectionResetError, BrokenPipeError, OSError):
        await writer.wait_closed()


# ---------------------------------------------------------------------------
# Master FD pump + uplink loop
# ---------------------------------------------------------------------------


async def _pump_master_to_client(master_fd: int, writer: asyncio.StreamWriter) -> None:
    """Read from the PTY master FD and forward each chunk as a STDOUT
    frame.  Returns on EOF or write failure."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    def _on_readable() -> None:
        try:
            data = os.read(master_fd, _READ_CHUNK)
        except OSError:
            data = b""
        if not data:
            with contextlib.suppress(ValueError, KeyError):
                loop.remove_reader(master_fd)
            queue.put_nowait(None)
            return
        queue.put_nowait(data)

    loop.add_reader(master_fd, _on_readable)
    try:
        while True:
            chunk = await queue.get()
            if chunk is None:
                return
            if not await _safe_write_frame(writer, PTYFrameType.STDOUT, chunk):
                return
    finally:
        with contextlib.suppress(ValueError, KeyError):
            loop.remove_reader(master_fd)


async def _pump_client_to_master(reader: asyncio.StreamReader, master_fd: int) -> None:
    """Read frames from the client and dispatch to the PTY master FD."""
    while True:
        try:
            ftype, payload = await read_frame(reader)
        except (asyncio.IncompleteReadError, ConnectionResetError):
            return
        except (ValueError, OSError) as exc:
            logger.debug("PTY uplink read error: %s", exc)
            return

        if ftype == PTYFrameType.STDIN:
            try:
                os.write(master_fd, payload)
            except OSError:
                return
        elif ftype == PTYFrameType.RESIZE:
            try:
                new_cols, new_rows = _parse_resize_payload(payload)
            except ValueError as exc:
                logger.debug("RESIZE ignored: %s", exc)
                continue
            _set_winsize(master_fd, new_rows, new_cols)
        elif ftype == PTYFrameType.OPEN:
            logger.debug("Duplicate OPEN frame ignored")
        else:
            logger.debug("Unknown PTY frame type %#x ignored", ftype)


# ---------------------------------------------------------------------------
# Lifecycle helpers
# ---------------------------------------------------------------------------


async def _read_open_frame(
    reader: asyncio.StreamReader, writer: asyncio.StreamWriter
) -> tuple[int, int, str, str] | None:
    """Read the first frame and parse it as OPEN.  Rejects + closes the
    writer on any problem and returns ``None`` in that case."""
    try:
        ftype, payload = await read_frame(reader)
    except (asyncio.IncompleteReadError, ConnectionResetError):
        writer.close()
        return None
    except (ValueError, OSError) as exc:
        logger.warning("PTY OPEN read error: %s", exc)
        await _reject_and_close(writer)
        return None

    if ftype != PTYFrameType.OPEN:
        logger.warning("PTY first frame was %#x, expected OPEN", ftype)
        await _reject_and_close(writer)
        return None

    try:
        return _parse_open_payload(payload)
    except ValueError as exc:
        logger.warning("PTY OPEN payload invalid: %s", exc)
        await _reject_and_close(writer)
        return None


async def _spawn_shell(shell: str, cwd: str, slave_fd: int) -> Process:
    """Spawn the shell with the slave FD as its stdio and its own session."""
    return await asyncio.create_subprocess_exec(
        shell,
        "-i",
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=cwd,
        env=_sanitized_env(),
        preexec_fn=os.setsid,
        close_fds=True,
    )


async def _terminate_process_group(proc: Process) -> None:
    """SIGHUP the shell's pgid, wait briefly, then SIGKILL if still alive."""
    try:
        pgid = os.getpgid(proc.pid)
    except ProcessLookupError:
        return
    except OSError:
        logger.debug("getpgid failed", exc_info=True)
        return

    with contextlib.suppress(ProcessLookupError, OSError):
        os.killpg(pgid, signal.SIGHUP)

    try:
        await asyncio.wait_for(proc.wait(), timeout=_TERM_GRACE_SECONDS)
    except TimeoutError:
        with contextlib.suppress(ProcessLookupError, OSError):
            os.killpg(pgid, signal.SIGKILL)
        await proc.wait()


# ---------------------------------------------------------------------------
# Connection handler
# ---------------------------------------------------------------------------


async def handle_pty_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    """Handle one PTY session."""
    peer = writer.get_extra_info("peername")
    logger.info("PTY client connected from %s", peer)

    open_args = await _read_open_frame(reader, writer)
    if open_args is None:
        return
    cols, rows, shell, cwd = open_args

    # Allocate the PTY pair and spawn the shell.
    master_fd, slave_fd = openpty()
    _set_winsize(master_fd, rows, cols)

    try:
        proc = await _spawn_shell(shell, cwd, slave_fd)
    except OSError:
        logger.exception("Failed to spawn PTY shell")
        os.close(master_fd)
        os.close(slave_fd)
        await _reject_and_close(writer)
        return
    finally:
        # Parent doesn't need the slave end once the child has it (or on
        # failure, we close it explicitly above).
        pass

    os.close(slave_fd)
    logger.info("PTY shell started pid=%s shell=%s cols=%dx%d", proc.pid, shell, cols, rows)

    uplink = asyncio.create_task(_pump_client_to_master(reader, master_fd), name="pty-uplink")
    downlink = asyncio.create_task(_pump_master_to_client(master_fd, writer), name="pty-downlink")
    wait_task = asyncio.create_task(proc.wait(), name="pty-proc-wait")

    try:
        done, _ = await asyncio.wait(
            {uplink, downlink, wait_task}, return_when=asyncio.FIRST_COMPLETED
        )
        # Treat uplink completion as "client went away" — everything
        # else (downlink EOF / shell exit) means the shell finished on
        # its own and we should just wait for its exit code.
        if uplink in done and not wait_task.done():
            await _terminate_process_group(proc)
        elif not wait_task.done():
            # downlink finished but uplink still pumping — give the
            # shell a brief moment to exit naturally before forcing it.
            try:
                await asyncio.wait_for(proc.wait(), timeout=_TERM_GRACE_SECONDS)
            except TimeoutError:
                await _terminate_process_group(proc)
    finally:
        for task in (uplink, downlink, wait_task):
            if not task.done():
                task.cancel()
        for task in (uplink, downlink, wait_task):
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        with contextlib.suppress(OSError):
            os.close(master_fd)

        exit_code = proc.returncode if proc.returncode is not None else -1
        signal_num: int | None = None
        if exit_code < 0:
            signal_num = -exit_code
            exit_code = -1
        await _safe_write_frame(writer, PTYFrameType.EXIT, _exit_payload(exit_code, signal_num))
        writer.close()
        with contextlib.suppress(ConnectionResetError, BrokenPipeError, OSError):
            await writer.wait_closed()
        logger.info(
            "PTY session ended pid=%s exit=%s signal=%s",
            proc.pid,
            exit_code,
            signal_num,
        )


# ---------------------------------------------------------------------------
# Server entrypoint
# ---------------------------------------------------------------------------


async def run_pty_server(host: str = "127.0.0.1", port: int = PTY_SERVER_PORT) -> None:
    """Start the PTY server and block until cancelled."""
    server = await asyncio.start_server(handle_pty_client, host, port)
    sockets = ", ".join(str(s.getsockname()) for s in server.sockets or [])
    logger.info("PTY server listening on %s", sockets)
    try:
        async with server:
            await server.serve_forever()
    except asyncio.CancelledError:
        logger.info("PTY server cancelled")
        raise
