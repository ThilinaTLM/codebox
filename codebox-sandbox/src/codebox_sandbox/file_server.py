"""Lightweight HTTP file server for sandbox workspace operations.

Listens on ``127.0.0.1:19080`` (localhost only) and is accessed
exclusively through the yamux tunnel — never exposed externally.

Provides list, read, download, write, and upload operations on the
``/workspace`` directory tree.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
from pathlib import Path

from aiohttp import BodyPartReader, web
from codebox_tunnel.protocol import FILE_SERVER_PORT

logger = logging.getLogger(__name__)

_WORKSPACE_ROOT = Path("/workspace")
_STREAM_CHUNK_SIZE = 65536  # 64 KB chunks for streaming downloads

# ---------------------------------------------------------------------------
# Binary detection helpers (ported from codebox_agent.agent_runner)
# ---------------------------------------------------------------------------

_TEXT_MIME_PREFIXES = (
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/x-sh",
    "application/toml",
    "application/yaml",
    "application/x-yaml",
)


def _is_likely_binary_by_name(filename: str) -> bool:
    """Extension-based binary heuristic — no disk I/O."""
    mime, _ = mimetypes.guess_type(filename)
    if mime is None:
        return False  # unknown = assume text (safe default for code files)
    return not any(mime.startswith(p) for p in _TEXT_MIME_PREFIXES)


def _is_binary_file(path: Path) -> bool:
    """Heuristic: check MIME type and first 8 KB for null bytes."""
    mime, _ = mimetypes.guess_type(str(path))
    if mime and mime.startswith("text/"):
        return False
    try:
        chunk = path.read_bytes()[:8192]
    except Exception:
        return True
    return b"\x00" in chunk


def _validate_workspace_path(raw_path: str) -> Path:
    """Resolve a path and ensure it lives under the workspace root."""
    resolved = Path(raw_path).resolve()
    if not (resolved == _WORKSPACE_ROOT or _WORKSPACE_ROOT in resolved.parents):
        raise ValueError(f"Path must be under {_WORKSPACE_ROOT}")
    return resolved


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------


async def handle_list(request: web.Request) -> web.Response:
    """List directory contents.

    ``GET /list?path=/workspace``
    """
    raw_path = request.query.get("path", str(_WORKSPACE_ROOT))
    try:
        dir_path = _validate_workspace_path(raw_path)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)

    if not dir_path.exists():
        return web.json_response({"error": f"Path not found: {raw_path}"}, status=404)
    if not dir_path.is_dir():
        return web.json_response({"error": f"Not a directory: {raw_path}"}, status=400)

    entries = []
    for child in sorted(dir_path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        try:
            stat = child.stat()
            is_dir = child.is_dir()
            entries.append(
                {
                    "name": child.name,
                    "path": str(child),
                    "is_dir": is_dir,
                    "size": stat.st_size if child.is_file() else None,
                    "is_binary": not is_dir and _is_likely_binary_by_name(child.name),
                }
            )
        except OSError:
            continue

    return web.json_response({"path": str(dir_path), "entries": entries})


async def handle_read(request: web.Request) -> web.Response:
    """Read file content (JSON with text or base64).

    ``GET /read?path=/workspace/file.py``
    """
    raw_path = request.query.get("path", "")
    if not raw_path:
        return web.json_response({"error": "path parameter required"}, status=400)

    try:
        file_path = _validate_workspace_path(raw_path)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)

    if not file_path.exists():
        return web.json_response({"error": f"File not found: {raw_path}"}, status=404)
    if not file_path.is_file():
        return web.json_response({"error": f"Not a file: {raw_path}"}, status=400)

    size = file_path.stat().st_size
    is_binary = _is_binary_file(file_path)

    if is_binary:
        raw = file_path.read_bytes()
        data = {
            "path": str(file_path),
            "content": "",
            "content_base64": base64.b64encode(raw).decode("ascii"),
            "size": size,
            "is_binary": True,
        }
    else:
        content = file_path.read_text(errors="replace")
        data = {
            "path": str(file_path),
            "content": content,
            "size": size,
            "is_binary": False,
        }

    return web.json_response(data)


async def handle_download(request: web.Request) -> web.StreamResponse:
    """Stream raw file bytes for download.

    ``GET /download?path=/workspace/file.bin``
    """
    raw_path = request.query.get("path", "")
    if not raw_path:
        return web.json_response({"error": "path parameter required"}, status=400)

    try:
        file_path = _validate_workspace_path(raw_path)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)

    if not file_path.exists():
        return web.json_response({"error": f"File not found: {raw_path}"}, status=404)
    if not file_path.is_file():
        return web.json_response({"error": f"Not a file: {raw_path}"}, status=400)

    size = file_path.stat().st_size
    mime_type, _ = mimetypes.guess_type(str(file_path))
    filename = file_path.name

    response = web.StreamResponse(
        status=200,
        headers={
            "Content-Type": mime_type or "application/octet-stream",
            "Content-Length": str(size),
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
    await response.prepare(request)

    with file_path.open("rb") as f:
        while True:
            chunk = f.read(_STREAM_CHUNK_SIZE)
            if not chunk:
                break
            await response.write(chunk)

    await response.write_eof()
    return response


async def handle_write(request: web.Request) -> web.Response:
    """Write content to a file.

    ``POST /write?path=/workspace/file.py``
    Body: raw file content bytes.
    """
    raw_path = request.query.get("path", "")
    if not raw_path:
        return web.json_response({"error": "path parameter required"}, status=400)

    try:
        file_path = _validate_workspace_path(raw_path)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)

    # Create parent directories if needed
    file_path.parent.mkdir(parents=True, exist_ok=True)

    body = await request.read()
    file_path.write_bytes(body)

    return web.json_response({"path": str(file_path), "size": len(body)})


async def handle_upload(request: web.Request) -> web.Response:
    """Upload a file via multipart form data.

    ``POST /upload?path=/workspace/dir/``
    Body: multipart form with a ``file`` field.
    """
    raw_path = request.query.get("path", "")
    if not raw_path:
        return web.json_response({"error": "path parameter required"}, status=400)

    try:
        dir_path = _validate_workspace_path(raw_path)
    except ValueError as exc:
        return web.json_response({"error": str(exc)}, status=400)

    dir_path.mkdir(parents=True, exist_ok=True)

    reader = await request.multipart()
    if reader is None:
        return web.json_response({"error": "Expected multipart form data"}, status=400)

    uploaded = []
    async for part in reader:
        if not isinstance(part, BodyPartReader) or part.name != "file":
            continue
        filename = part.filename or "uploaded_file"
        file_path = dir_path / filename

        # Validate the final path is still under workspace
        resolved = file_path.resolve()
        if not (_WORKSPACE_ROOT in resolved.parents or resolved == _WORKSPACE_ROOT):
            return web.json_response(
                {"error": f"Filename escapes workspace: {filename}"}, status=400
            )

        size = 0
        with file_path.open("wb") as f:
            while True:
                chunk = await part.read_chunk(_STREAM_CHUNK_SIZE)
                if not chunk:
                    break
                f.write(chunk)
                size += len(chunk)

        uploaded.append({"path": str(file_path), "size": size})

    if not uploaded:
        return web.json_response({"error": "No file field in upload"}, status=400)

    return web.json_response({"files": uploaded})


# ---------------------------------------------------------------------------
# Server entry point
# ---------------------------------------------------------------------------


def _create_app() -> web.Application:
    """Create the aiohttp application with all routes."""
    app = web.Application()
    app.router.add_get("/list", handle_list)
    app.router.add_get("/read", handle_read)
    app.router.add_get("/download", handle_download)
    app.router.add_post("/write", handle_write)
    app.router.add_post("/upload", handle_upload)
    return app


async def run_file_server(
    host: str = "127.0.0.1",
    port: int = FILE_SERVER_PORT,
) -> None:
    """Start the file server and block until cancelled."""
    app = _create_app()
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info("File server listening on %s:%d", host, port)
    try:
        # Block until the task is cancelled
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()


# Need asyncio for the blocking Event
import asyncio  # noqa: E402
