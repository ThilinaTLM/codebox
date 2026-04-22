"""Entry point for the sandbox daemon in callback mode."""

import asyncio
import logging
import os

from codebox_tunnel import compose_tunnel_url

from codebox_sandbox.callback import run_callback
from codebox_sandbox.file_server import run_file_server
from codebox_sandbox.pty_server import run_pty_server
from codebox_sandbox.tunnel.connector import run_tunnel

logger = logging.getLogger(__name__)


async def _run_all() -> None:
    """Run gRPC callback, file server, and tunnel concurrently."""
    orchestrator_url = os.environ.get("CODEBOX_ORCHESTRATOR_URL", "")
    callback_token = os.environ.get("CODEBOX_CALLBACK_TOKEN", "")

    tasks = [asyncio.create_task(run_callback(), name="grpc-callback")]

    if orchestrator_url:
        tunnel_url = compose_tunnel_url(orchestrator_url)
        tasks.append(asyncio.create_task(run_file_server(), name="file-server"))
        tasks.append(asyncio.create_task(run_pty_server(), name="pty-server"))
        tasks.append(asyncio.create_task(run_tunnel(tunnel_url, callback_token), name="tunnel"))
        logger.info("Tunnel enabled — file server + PTY server + tunnel connector starting")
    else:
        logger.warning("CODEBOX_ORCHESTRATOR_URL not set — file browser tunnel disabled")

    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
    # If any task exits with an exception, cancel the others
    for task in pending:
        task.cancel()
    # Re-raise the first exception
    for task in done:
        exc = task.exception()
        if exc is not None:
            raise exc


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    asyncio.run(_run_all())


if __name__ == "__main__":
    main()
