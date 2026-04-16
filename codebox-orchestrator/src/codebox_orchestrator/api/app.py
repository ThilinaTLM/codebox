"""FastAPI application factory -- composition root."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from codebox_orchestrator.config import settings
from codebox_orchestrator.shared.persistence.migrate import run_migrations

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:  # noqa: PLR0915

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # noqa: PLR0915
        # Secret/config validation happens at Settings() construction in config.py.

        # --- Database migrations (Alembic) ---
        from codebox_orchestrator.shared.persistence.engine import (  # noqa: PLC0415
            async_session_factory,
            engine,
        )

        run_migrations()

        # --- Auth service ---
        from codebox_orchestrator.auth.service import AuthService  # noqa: PLC0415

        auth_service = AuthService(async_session_factory)

        # --- Project service ---
        from codebox_orchestrator.project.repository import (  # noqa: PLC0415
            ProjectRepository,
        )
        from codebox_orchestrator.project.service import ProjectService  # noqa: PLC0415

        project_repo = ProjectRepository(async_session_factory)
        project_service = ProjectService(project_repo)

        # Ensure default admin
        await auth_service.ensure_default_admin()

        # --- LLM Profile & Project Settings services ---
        from codebox_orchestrator.llm_profile.repository import (  # noqa: PLC0415
            LLMProfileRepository,
        )
        from codebox_orchestrator.llm_profile.service import LLMProfileService  # noqa: PLC0415
        from codebox_orchestrator.project_settings.repository import (  # noqa: PLC0415
            ProjectSettingsRepository,
        )
        from codebox_orchestrator.project_settings.service import (  # noqa: PLC0415
            ProjectSettingsService,
        )

        llm_profile_repo = LLMProfileRepository(async_session_factory)
        llm_profile_service = LLMProfileService(llm_profile_repo)
        project_settings_repo = ProjectSettingsRepository(async_session_factory)
        project_settings_service = ProjectSettingsService(project_settings_repo)

        # --- Shared infrastructure ---
        from codebox_orchestrator.shared.messaging.global_broadcast import (  # noqa: PLC0415
            GlobalBroadcastService,
        )
        from codebox_orchestrator.shared.messaging.relay import RelayService  # noqa: PLC0415

        relay = RelayService()
        global_broadcast = GlobalBroadcastService()

        # --- Infrastructure adapters ---
        from codebox_orchestrator.agent.infrastructure.callback_registry import (  # noqa: PLC0415
            CallbackRegistry,
        )
        from codebox_orchestrator.agent.infrastructure.connection_adapter import (  # noqa: PLC0415
            AgentConnectionAdapter,
        )
        from codebox_orchestrator.agent.infrastructure.event_repository import (  # noqa: PLC0415
            SqlAlchemyBoxEventRepository,
        )
        from codebox_orchestrator.box.infrastructure.box_repository import (  # noqa: PLC0415
            BoxRepository,
        )
        from codebox_orchestrator.box.infrastructure.event_publisher import (  # noqa: PLC0415
            EventPublisherAdapter,
        )
        from codebox_orchestrator.compute.application.commands import (  # noqa: PLC0415
            ProvisionContainerHandler,
            RemoveContainerHandler,
            RestartContainerHandler,
            StopContainerHandler,
        )
        from codebox_orchestrator.compute.docker.docker_adapter import (  # noqa: PLC0415
            DockerRuntime,
        )

        event_publisher = EventPublisherAdapter(relay, global_broadcast)
        container_runtime = DockerRuntime()
        registry = CallbackRegistry()
        agent_connections = AgentConnectionAdapter(registry)
        event_repository = SqlAlchemyBoxEventRepository(async_session_factory)
        box_repository = BoxRepository(async_session_factory)

        provision_container = ProvisionContainerHandler(container_runtime)
        stop_container = StopContainerHandler(container_runtime)
        restart_container = RestartContainerHandler(container_runtime)
        remove_container = RemoveContainerHandler(container_runtime)

        # --- Box state store (in-memory lifecycle tracking) ---
        from codebox_orchestrator.box.infrastructure.box_state_store import (  # noqa: PLC0415
            BoxStateStore,
        )

        box_state_store = BoxStateStore()

        # --- Box query service ---
        from codebox_orchestrator.box.application.services.box_query import (  # noqa: PLC0415
            BoxQueryService,
        )

        query_service = BoxQueryService(
            container_runtime,
            registry,
            agent_connections,
            box_state_store,
            event_repository,
            box_repository,
        )

        # --- Application layer: Agent commands & queries ---
        from codebox_orchestrator.agent.application.commands.handle_sandbox_event import (  # noqa: PLC0415
            HandleBoxEventHandler,
        )
        from codebox_orchestrator.agent.application.commands.send_exec import (  # noqa: PLC0415
            SendExecHandler,
        )
        from codebox_orchestrator.agent.application.commands.send_message import (  # noqa: PLC0415
            SendMessageHandler,
        )

        send_message_handler = SendMessageHandler(
            event_publisher,
            agent_connections,
            event_repository,
        )
        send_exec_handler = SendExecHandler(
            event_publisher,
            agent_connections,
            event_repository,
        )
        event_handler = HandleBoxEventHandler(
            event_publisher,
            registry,
            event_repository,
        )
        # --- Tunnel registry ---
        from codebox_orchestrator.tunnel.registry import TunnelRegistry  # noqa: PLC0415

        tunnel_registry = TunnelRegistry()

        # --- Box lifecycle service ---
        from codebox_orchestrator.agent.infrastructure.callback_token import (  # noqa: PLC0415
            create_callback_token,
        )
        from codebox_orchestrator.box.application.services.box_lifecycle import (  # noqa: PLC0415
            BoxLifecycleService,
        )

        lifecycle = BoxLifecycleService(
            provision_container=provision_container,
            connections=agent_connections,
            publisher=event_publisher,
            state_store=box_state_store,
            send_exec_and_wait_fn=send_exec_handler.execute_and_wait,
            create_callback_token_fn=create_callback_token,
        )

        # --- Application layer: Box commands ---
        from codebox_orchestrator.box.application.commands.cancel_box import (  # noqa: PLC0415
            CancelBoxHandler,
        )
        from codebox_orchestrator.box.application.commands.create_box import (  # noqa: PLC0415
            CreateBoxHandler,
        )
        from codebox_orchestrator.box.application.commands.delete_box import (  # noqa: PLC0415
            DeleteBoxHandler,
        )
        from codebox_orchestrator.box.application.commands.restart_box import (  # noqa: PLC0415
            RestartBoxHandler,
        )
        from codebox_orchestrator.box.application.commands.stop_box import (  # noqa: PLC0415
            StopBoxHandler,
        )

        create_box_handler = CreateBoxHandler(
            event_publisher,
            lifecycle,
            box_state_store,
            box_repository,
        )
        stop_box_handler = StopBoxHandler(
            stop_container,
            agent_connections,
            event_publisher,
            query_service,
        )
        restart_box_handler = RestartBoxHandler(
            restart_container,
            event_publisher,
            query_service,
        )
        delete_box_handler = DeleteBoxHandler(
            remove_container,
            event_publisher,
            stop_box_handler,
            query_service,
            box_state_store,
            box_repository,
        )
        cancel_box_handler = CancelBoxHandler(agent_connections)

        from codebox_orchestrator.project.service import (  # noqa: PLC0415
            ProjectLifecycleService,
        )

        project_lifecycle_service = ProjectLifecycleService(
            project_repo,
            box_repository,
            llm_profile_repo,
            delete_box_handler,
            event_publisher,
        )

        # --- Per-project GitHub integration ---
        from codebox_orchestrator.integration.github.application.client_manager import (  # noqa: PLC0415
            GitHubClientManager,
        )
        from codebox_orchestrator.integration.github.infrastructure.github_repository import (  # noqa: PLC0415
            SqlAlchemyGitHubRepository,
        )

        github_repo = SqlAlchemyGitHubRepository(async_session_factory)
        github_client_manager = GitHubClientManager(
            settings_repo=project_settings_repo,
            github_repo=github_repo,
        )
        # Wire GitHub client manager into lifecycle for token retrieval
        lifecycle._github_client_manager = github_client_manager  # noqa: SLF001

        # --- Container runtime check ---
        try:
            runtime_info = container_runtime.check_connection()
            logger.info("Container runtime: %s", runtime_info)
        except Exception as exc:
            logger.warning("Container runtime not available: %s", exc)

        # --- Start gRPC server ---
        from codebox_orchestrator.agent.infrastructure.grpc.server import (  # noqa: PLC0415
            start_grpc_server,
        )

        grpc_server = await start_grpc_server(
            port=settings.grpc.port,
            event_handler=event_handler,
            registry=registry,
        )

        # --- Store everything in app.state ---
        app.state.create_box_handler = create_box_handler
        app.state.stop_box_handler = stop_box_handler
        app.state.restart_box_handler = restart_box_handler
        app.state.delete_box_handler = delete_box_handler
        app.state.cancel_box_handler = cancel_box_handler
        app.state.query_service = query_service
        app.state.send_message_handler = send_message_handler
        app.state.send_exec_handler = send_exec_handler
        app.state.tunnel_registry = tunnel_registry
        app.state.lifecycle_service = lifecycle
        app.state.container_runtime = container_runtime
        app.state.relay_service = relay
        app.state.global_broadcast = global_broadcast
        app.state.auth_service = auth_service
        app.state.event_repository = event_repository
        app.state.llm_profile_service = llm_profile_service
        app.state.project_settings_service = project_settings_service
        app.state.github_client_manager = github_client_manager
        app.state.github_repository = github_repo
        # In-memory CSRF tokens for the GitHub App manifest flow:
        # project_id -> (state_token, expires_at_epoch).
        # Single-instance only; move to Postgres if we ever run replicas.
        app.state.github_manifest_states = {}
        app.state.project_service = project_service
        app.state.project_lifecycle_service = project_lifecycle_service
        app.state.box_repository = box_repository

        yield

        # --- Shutdown ---
        await grpc_server.stop(grace=5)
        await lifecycle.shutdown()
        await engine.dispose()

    app = FastAPI(
        title="Codebox Orchestrator",
        version="0.7.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def refresh_auth_cookie(request: Request, call_next):
        """Sliding expiration: refresh the auth cookie TTL on each successful request."""
        response = await call_next(request)
        token = request.cookies.get("access_token")
        if token and response.status_code < 400:
            secure = settings.environment != "development"
            response.set_cookie(
                key="access_token",
                value=token,
                httponly=True,
                secure=secure,
                samesite="lax",
                path="/",
                max_age=int(settings.auth.token_expiry_hours * 3600),
            )
        return response

    # --- Health endpoint (global) ---
    @app.get("/api/health")
    async def health_check():
        return {"status": "ok"}

    from codebox_orchestrator.api.routes import (  # noqa: PLC0415
        auth,
        boxes,
        github,
        llm_profiles,
        models,
        project_settings,
        projects,
        sse,
        tunnel,
    )
    from codebox_orchestrator.auth.dependencies import get_current_user  # noqa: PLC0415

    # Auth routes (no project scope)
    app.include_router(auth.router)

    # Project management
    app.include_router(projects.router, dependencies=[Depends(get_current_user)])

    # Project-scoped routes (auth enforced via get_project_context dependency)
    app.include_router(boxes.router, dependencies=[Depends(get_current_user)])
    app.include_router(models.router, dependencies=[Depends(get_current_user)])
    app.include_router(sse.router, dependencies=[Depends(get_current_user)])
    app.include_router(llm_profiles.router, dependencies=[Depends(get_current_user)])
    app.include_router(project_settings.router, dependencies=[Depends(get_current_user)])
    app.include_router(github.router)
    app.include_router(tunnel.router)  # WebSocket + file proxy

    return app
