"""FastAPI application factory."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from codebox_orchestrator.config import (
    CORS_ORIGINS,
    DATABASE_URL,
    GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY_PATH,
    GITHUB_APP_SLUG,
    GITHUB_BOT_NAME,
    GITHUB_WEBHOOK_SECRET,
    github_enabled,
)
from codebox_orchestrator.db.engine import async_session_factory, engine
from codebox_orchestrator.db.migrations import run_migrations
from codebox_orchestrator.db.models import Base
from codebox_orchestrator.routes import api, ws_relay
from codebox_orchestrator.routes import ws_callback
from codebox_orchestrator.routes import github as github_routes
from codebox_orchestrator.services.callback_registry import CallbackRegistry
from codebox_orchestrator.services.relay_service import RelayService
from codebox_orchestrator.services.sandbox_service import SandboxService
from codebox_orchestrator.services.task_service import TaskService


def create_app() -> FastAPI:

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Ensure the SQLite database directory exists
        if DATABASE_URL.startswith("sqlite"):
            db_path = DATABASE_URL.split("///", 1)[-1]
            os.makedirs(os.path.dirname(db_path), exist_ok=True)

        # Create tables on startup
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        # Run idempotent column migrations for existing tables
        await run_migrations(engine)

        # Initialize services
        relay = RelayService()
        registry = CallbackRegistry()
        task_service = TaskService(
            session_factory=async_session_factory,
            relay=relay,
            registry=registry,
        )
        sandbox_service = SandboxService(
            session_factory=async_session_factory,
            relay=relay,
            registry=registry,
        )

        # Initialize GitHub service if configured
        github_service = None
        if github_enabled():
            from codebox_orchestrator.services.github_service import GitHubService

            github_service = GitHubService(
                session_factory=async_session_factory,
                app_id=GITHUB_APP_ID,
                private_key_path=GITHUB_APP_PRIVATE_KEY_PATH,
                webhook_secret=GITHUB_WEBHOOK_SECRET,
                app_slug=GITHUB_APP_SLUG,
                bot_name=GITHUB_BOT_NAME,
            )
            # Give task_service access to the GitHub service for setup commands
            task_service._github_service = github_service

        app.state.relay_service = relay
        app.state.callback_registry = registry
        app.state.task_service = task_service
        app.state.sandbox_service = sandbox_service
        app.state.github_service = github_service
        # Expose session factory for ws_callback route
        app.state._sf = async_session_factory

        yield

        # Shutdown: cancel all running tasks and sandboxes
        await task_service.shutdown()
        await sandbox_service.shutdown()
        await engine.dispose()

    app = FastAPI(
        title="Codebox Orchestrator",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS for web-ui
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api.router)
    app.include_router(ws_relay.router)
    app.include_router(ws_callback.router)
    app.include_router(github_routes.router)

    return app
