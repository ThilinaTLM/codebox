"""Integration tests for ``codebox_sandbox.pty_server``.

These spin up the real server on an ephemeral loopback port and drive it
via ``asyncio.open_connection`` — no orchestrator, no yamux, just the
frame protocol.  Requires ``/bin/sh`` (always present on Linux CI).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import socket

import pytest
from codebox_tunnel.pty_frames import PTYFrameType, read_frame, write_frame

from codebox_sandbox.pty_server import handle_pty_client, run_pty_server

# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------


@pytest.fixture
async def pty_server_port() -> int:
    """Start the PTY server on a random port, yield the port, tear down."""
    server = await asyncio.start_server(handle_pty_client, "127.0.0.1", 0)
    assert server.sockets
    port = server.sockets[0].getsockname()[1]
    serve_task = asyncio.create_task(server.serve_forever(), name="test-pty-server")
    try:
        yield port
    finally:
        server.close()
        await server.wait_closed()
        serve_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await serve_task


async def _open(port: int) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    return await asyncio.open_connection("127.0.0.1", port)


async def _close_writer(writer: asyncio.StreamWriter) -> None:
    writer.close()
    with contextlib.suppress(ConnectionResetError, BrokenPipeError, OSError):
        await writer.wait_closed()


async def _collect_stdout_until_exit(
    reader: asyncio.StreamReader,
    *,
    timeout: float = 5.0,  # noqa: ASYNC109 — test helper keeps a simple timeout arg
) -> tuple[bytes, dict]:
    """Read frames until EXIT; return (concatenated stdout, exit JSON)."""
    out = bytearray()

    async def _loop() -> dict:
        while True:
            ftype, payload = await read_frame(reader)
            if ftype == PTYFrameType.STDOUT:
                out.extend(payload)
            elif ftype == PTYFrameType.EXIT:
                return json.loads(payload)

    exit_info = await asyncio.wait_for(_loop(), timeout=timeout)
    return bytes(out), exit_info


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


async def test_echo_command_exits_cleanly(pty_server_port: int) -> None:
    reader, writer = await _open(pty_server_port)
    try:
        await write_frame(
            writer,
            PTYFrameType.OPEN,
            json.dumps({"cols": 80, "rows": 24, "shell": "/bin/sh", "cwd": "/tmp"}).encode(),
        )
        await write_frame(writer, PTYFrameType.STDIN, b"echo hello-pty-world\n")
        await write_frame(writer, PTYFrameType.STDIN, b"exit\n")

        stdout, exit_info = await _collect_stdout_until_exit(reader, timeout=10.0)
    finally:
        await _close_writer(writer)

    assert b"hello-pty-world" in stdout
    assert exit_info["exit_code"] == 0


async def test_invalid_open_shell_falls_back(pty_server_port: int) -> None:
    reader, writer = await _open(pty_server_port)
    try:
        # Request a disallowed shell — server should fall back to
        # /bin/bash (or /bin/sh if bash isn't present) and still work.
        payload = json.dumps(
            {"cols": 80, "rows": 24, "shell": "/bin/notashell", "cwd": "/tmp"}
        ).encode()
        await write_frame(writer, PTYFrameType.OPEN, payload)
        await write_frame(writer, PTYFrameType.STDIN, b"echo fallback-ok\n")
        await write_frame(writer, PTYFrameType.STDIN, b"exit\n")
        stdout, exit_info = await _collect_stdout_until_exit(reader, timeout=10.0)
    finally:
        await _close_writer(writer)
    assert b"fallback-ok" in stdout
    assert exit_info["exit_code"] == 0


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


async def test_first_frame_must_be_open(pty_server_port: int) -> None:
    """If the client sends STDIN before OPEN, the server must reject and
    close with a non-zero exit marker."""
    reader, writer = await _open(pty_server_port)
    try:
        await write_frame(writer, PTYFrameType.STDIN, b"echo should-not-run\n")
        # Expect an EXIT frame as the server's response.
        ftype, payload = await asyncio.wait_for(read_frame(reader), timeout=5.0)
        assert ftype == PTYFrameType.EXIT
        info = json.loads(payload)
        assert info["exit_code"] != 0
    finally:
        await _close_writer(writer)


async def test_malformed_open_json_rejected(pty_server_port: int) -> None:
    reader, writer = await _open(pty_server_port)
    try:
        await write_frame(writer, PTYFrameType.OPEN, b"not-json")
        ftype, payload = await asyncio.wait_for(read_frame(reader), timeout=5.0)
        assert ftype == PTYFrameType.EXIT
        info = json.loads(payload)
        assert info["exit_code"] != 0
    finally:
        await _close_writer(writer)


# ---------------------------------------------------------------------------
# Env sanitization
# ---------------------------------------------------------------------------


async def test_secret_env_vars_not_visible_to_shell(
    pty_server_port: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """If the sandbox process has a secret in its env, the spawned shell
    must not see it.

    Also covers a generic ``*_TOKEN``-shaped var to guard against the
    ``GH_TOKEN`` allow-list exemption accidentally widening to other
    token-named vars.
    """
    monkeypatch.setenv("CODEBOX_CALLBACK_TOKEN", "secret-not-for-user")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-very-secret")
    monkeypatch.setenv("SOMETHING_TOKEN", "leak-me-not")

    reader, writer = await _open(pty_server_port)
    try:
        await write_frame(
            writer,
            PTYFrameType.OPEN,
            json.dumps({"cols": 80, "rows": 24, "shell": "/bin/sh", "cwd": "/tmp"}).encode(),
        )
        await write_frame(
            writer,
            PTYFrameType.STDIN,
            b"printf 'TOKEN=[%s] KEY=[%s] OTHER=[%s]\\n'"
            b' "$CODEBOX_CALLBACK_TOKEN" "$OPENAI_API_KEY" "$SOMETHING_TOKEN"\n',
        )
        await write_frame(writer, PTYFrameType.STDIN, b"exit\n")
        stdout, exit_info = await _collect_stdout_until_exit(reader, timeout=10.0)
    finally:
        await _close_writer(writer)

    # Neither the value nor any leftover substring should appear.
    assert b"secret-not-for-user" not in stdout
    assert b"sk-very-secret" not in stdout
    assert b"leak-me-not" not in stdout
    # The shell should have printed empty values.
    assert b"TOKEN=[]" in stdout
    assert b"KEY=[]" in stdout
    assert b"OTHER=[]" in stdout
    assert exit_info["exit_code"] == 0


async def test_gh_token_visible_to_shell(
    pty_server_port: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``GH_TOKEN`` is intentionally allow-listed so ``gh`` CLI works in
    the interactive terminal.  The installation token is already
    persisted to ``~/.gitconfig`` by the orchestrator's setup commands,
    so stripping it from the PTY env would provide no real protection.
    """
    monkeypatch.setenv("GH_TOKEN", "ghs_test_installation_token")

    reader, writer = await _open(pty_server_port)
    try:
        await write_frame(
            writer,
            PTYFrameType.OPEN,
            json.dumps({"cols": 80, "rows": 24, "shell": "/bin/sh", "cwd": "/tmp"}).encode(),
        )
        await write_frame(
            writer,
            PTYFrameType.STDIN,
            b"printf 'GH=[%s]\\n' \"$GH_TOKEN\"\n",
        )
        await write_frame(writer, PTYFrameType.STDIN, b"exit\n")
        stdout, exit_info = await _collect_stdout_until_exit(reader, timeout=10.0)
    finally:
        await _close_writer(writer)

    assert b"GH=[ghs_test_installation_token]" in stdout
    assert exit_info["exit_code"] == 0


# ---------------------------------------------------------------------------
# run_pty_server sanity
# ---------------------------------------------------------------------------


async def test_run_pty_server_accepts_connections() -> None:
    """Smoke test that ``run_pty_server`` starts and accepts a client."""
    # Find a free port.
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()

    task = asyncio.create_task(run_pty_server(port=port))
    try:
        await asyncio.sleep(0.1)  # Let it bind.
        _reader, writer = await _open(port)
        await _close_writer(writer)
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
