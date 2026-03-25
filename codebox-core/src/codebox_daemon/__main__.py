"""Entrypoint for running the codebox daemon in callback mode."""

import asyncio
import logging

from codebox_daemon.callback import run_callback


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    asyncio.run(run_callback())


if __name__ == "__main__":
    main()
