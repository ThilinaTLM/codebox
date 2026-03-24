"""Entrypoint for running the codebox daemon."""

import logging
import os

import uvicorn

from codebox_daemon.app import create_app
from codebox_daemon.tls import ensure_tls_certs


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    app = create_app()
    cert_path, key_path = ensure_tls_certs()
    port = int(os.environ.get("CODEBOX_PORT", "8443"))

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        ssl_keyfile=key_path,
        ssl_certfile=cert_path,
    )


if __name__ == "__main__":
    main()
