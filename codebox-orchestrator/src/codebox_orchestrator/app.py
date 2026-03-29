"""FastAPI application factory."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

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
    GRPC_PORT,
    github_enabled,
)
from codebox_orchestrator.db.engine import async_session_factory, engine
from codebox_orchestrator.db.migrations import run_migrations
from codebox_orchestrator.db.models import Base
from codebox_orchestrator.routes import api, sse
from codebox_orchestrator.routes import github as github_routes
from codebox_orchestrator.services.box_service import BoxService
from codebox_orchestrator.services.callback_registry import CallbackRegistry
from codebox_orchestrator.services.global_broadcast_service import GlobalBroadcastService
from codebox_orchestrator.services.relay_service import RelayService


def create_app() -> FastAPI:

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Ensure the SQLite database directory exists
        if DATABASE_URL.startswith("sqlite"):
            db_path = DATABASE_URL.split("///", 1)[-1]
            os.makedirs(os.path.dirname(db_path), exist_ok=True)

        # Run migrations to drop legacy tables before creating new ones
        await run_migrations(engine)

        # Create tables on startup
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        # Initialize services
        relay = RelayService()
        registry = CallbackRegistry()
        global_broadcast = GlobalBroadcastService()
        box_service = BoxService(
            session_factory=async_session_factory,
            relay=relay,
            registry=registry,
            global_broadcast=global_broadcast,
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
            box_service._github_service = github_service

        # Verify container runtime connectivity
        import logging as _logging

        from codebox_orchestrator.services import docker_service

        try:
            runtime_info = docker_service.check_connection()
            _logging.getLogger(__name__).info("Container runtime: %s", runtime_info)
        except docker_service.DockerServiceError as exc:
            _logging.getLogger(__name__).warning("Container runtime not available: %s", exc)

        # Start gRPC server for sandbox connections
        from codebox_orchestrator.grpc.server import start_grpc_server

        grpc_server = await start_grpc_server(
            port=GRPC_PORT,
            session_factory=async_session_factory,
            relay=relay,
            registry=registry,
            global_broadcast=global_broadcast,
        )

        app.state.relay_service = relay
        app.state.callback_registry = registry
        app.state.global_broadcast = global_broadcast
        app.state.box_service = box_service
        app.state.github_service = github_service
        # Expose session factory for routes that need direct DB access
        app.state._sf = async_session_factory

        yield

        # Shutdown
        await grpc_server.stop(grace=5)
        await box_service.shutdown()
        await engine.dispose()

    app = FastAPI(
        title="Codebox Orchestrator",
        version="0.3.0",
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
    app.include_router(sse.router)
    app.include_router(github_routes.router)

    return app
