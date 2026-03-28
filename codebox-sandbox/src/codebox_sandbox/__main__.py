"""Entry point for the sandbox daemon in callback mode."""

import asyncio
import logging

from codebox_sandbox.callback import run_callback


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    asyncio.run(run_callback())


if __name__ == "__main__":
    main()
