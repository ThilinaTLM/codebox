"""Entry point for the GitHub Action agent."""

import asyncio
import logging
import os

from codebox_github_action.handler import run


def main() -> None:
    log_mode = os.environ.get("LOG_MODE", "human").lower()

    if log_mode == "debug":
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(name)s %(levelname)s %(message)s",
        )
    else:
        # Human mode: suppress framework noise, send callback uses print()
        logging.basicConfig(
            level=logging.WARNING,
            format="%(asctime)s %(levelname)s %(message)s",
        )
        from codebox_agent import suppress_internal_loggers

        suppress_internal_loggers(logging.WARNING)

    asyncio.run(run())


if __name__ == "__main__":
    main()
