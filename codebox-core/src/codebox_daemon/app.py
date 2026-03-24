"""FastAPI application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from codebox_daemon.routes import router as rest_router
from codebox_daemon.sessions import SessionManager
from codebox_daemon.ws import router as ws_router

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Build and return the FastAPI application."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info(
            "codebox-daemon starting up (version 0.1.0)"
        )
        yield
        logger.info("codebox-daemon shutting down")

    app = FastAPI(
        title="Codebox Daemon",
        version="0.1.0",
        lifespan=lifespan,
    )

    # --- State ---
    app.state.session_manager = SessionManager()

    # --- Middleware ---
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- Routers ---
    app.include_router(rest_router)
    app.include_router(ws_router)

    return app
