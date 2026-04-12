"""FastAPI application factory -- composition root."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from codebox_orchestrator.config import (
    CORS_ORIGINS,
    DATABASE_URL,
    GRPC_PORT,
)

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:  # noqa: PLR0915

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # noqa: PLR0915
        # --- Database setup ---
        import codebox_orchestrator.integration.github.infrastructure.orm_models as _gh_orm  # noqa: F401, PLC0415
        from codebox_orchestrator.agent.infrastructure.orm_models import (  # noqa: PLC0415
            Base as AgentBase,
        )
        from codebox_orchestrator.auth.models import AuthBase  # noqa: PLC0415
        from codebox_orchestrator.shared.persistence.engine import (  # noqa: PLC0415
            async_session_factory,
            engine,
        )

        if DATABASE_URL.startswith("sqlite"):
            db_path = DATABASE_URL.split("///", 1)[-1]
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        from codebox_orchestrator.integration.github.infrastructure.orm_models import (  # noqa: PLC0415
            Base as GitHubBase,
        )
        from codebox_orchestrator.llm_profile.models import LLMProfileBase  # noqa: PLC0415
        from codebox_orchestrator.user_settings.models import UserSettingsBase  # noqa: PLC0415

        async with engine.begin() as conn:
            await conn.run_sync(GitHubBase.metadata.create_all)
            await conn.run_sync(AuthBase.metadata.create_all)
            await conn.run_sync(AgentBase.metadata.create_all)
            await conn.run_sync(LLMProfileBase.metadata.create_all)
            await conn.run_sync(UserSettingsBase.metadata.create_all)

        # --- Auth service ---
        from codebox_orchestrator.auth.service import AuthService  # noqa: PLC0415

        auth_service = AuthService(async_session_factory)
        await auth_service.ensure_default_admin()

        # --- LLM Profile & User Settings services ---
        from codebox_orchestrator.llm_profile.repository import (  # noqa: PLC0415
            LLMProfileRepository,
        )
        from codebox_orchestrator.llm_profile.service import LLMProfileService  # noqa: PLC0415
        from codebox_orchestrator.user_settings.repository import (  # noqa: PLC0415
            UserSettingsRepository,
        )
        from codebox_orchestrator.user_settings.service import UserSettingsService  # noqa: PLC0415

        llm_profile_repo = LLMProfileRepository(async_session_factory)
        llm_profile_service = LLMProfileService(llm_profile_repo)
        user_settings_repo = UserSettingsRepository(async_session_factory)
        user_settings_service = UserSettingsService(user_settings_repo)

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
        from codebox_orchestrator.box.infrastructure.event_publisher import (  # noqa: PLC0415
            EventPublisherAdapter,
        )
        from codebox_orchestrator.compute.docker.docker_adapter import (  # noqa: PLC0415
            DockerRuntime,
        )

        event_publisher = EventPublisherAdapter(relay, global_broadcast)
        container_runtime = DockerRuntime()
        registry = CallbackRegistry()
        agent_connections = AgentConnectionAdapter(registry)
        event_repository = SqlAlchemyBoxEventRepository(async_session_factory)

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
            container_runtime, registry, agent_connections, box_state_store, event_repository
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
        from codebox_orchestrator.agent.application.queries.box_files import (  # noqa: PLC0415
            ListFilesHandler,
            ReadFileHandler,
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
        list_files_handler = ListFilesHandler(agent_connections)
        read_file_handler = ReadFileHandler(agent_connections)

        # --- Box lifecycle service ---
        from codebox_orchestrator.agent.infrastructure.callback_token import (  # noqa: PLC0415
            create_callback_token,
        )
        from codebox_orchestrator.box.application.services.box_lifecycle import (  # noqa: PLC0415
            BoxLifecycleService,
        )

        lifecycle = BoxLifecycleService(
            runtime=container_runtime,
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

        create_box_handler = CreateBoxHandler(event_publisher, lifecycle, box_state_store)
        stop_box_handler = StopBoxHandler(
            container_runtime, agent_connections, event_publisher, query_service
        )
        restart_box_handler = RestartBoxHandler(container_runtime, event_publisher, query_service)
        delete_box_handler = DeleteBoxHandler(
            container_runtime, event_publisher, stop_box_handler, query_service, box_state_store
        )
        cancel_box_handler = CancelBoxHandler(agent_connections)

        # --- Per-user GitHub integration ---
        from codebox_orchestrator.integration.github.application.client_manager import (  # noqa: PLC0415
            GitHubClientManager,
        )
        from codebox_orchestrator.integration.github.infrastructure.github_repository import (  # noqa: PLC0415
            SqlAlchemyGitHubRepository,
        )

        github_repo = SqlAlchemyGitHubRepository(async_session_factory)
        github_client_manager = GitHubClientManager(
            settings_repo=user_settings_repo,
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
            port=GRPC_PORT,
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
        app.state.list_files_handler = list_files_handler
        app.state.read_file_handler = read_file_handler
        app.state.lifecycle_service = lifecycle
        app.state.container_runtime = container_runtime
        app.state.relay_service = relay
        app.state.global_broadcast = global_broadcast
        app.state.auth_service = auth_service
        app.state.event_repository = event_repository
        app.state.llm_profile_service = llm_profile_service
        app.state.user_settings_service = user_settings_service
        app.state.github_client_manager = github_client_manager

        yield

        # --- Shutdown ---
        await grpc_server.stop(grace=5)
        await lifecycle.shutdown()
        await engine.dispose()

    app = FastAPI(
        title="Codebox Orchestrator",
        version="0.6.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from codebox_orchestrator.api.routes import (  # noqa: PLC0415
        auth,
        boxes,
        github,
        llm_profiles,
        models,
        sse,
        user_settings,
    )
    from codebox_orchestrator.auth.dependencies import get_current_user  # noqa: PLC0415

    app.include_router(auth.router)
    app.include_router(boxes.router, dependencies=[Depends(get_current_user)])
    app.include_router(models.router, dependencies=[Depends(get_current_user)])
    app.include_router(sse.router, dependencies=[Depends(get_current_user)])
    app.include_router(llm_profiles.router, dependencies=[Depends(get_current_user)])
    app.include_router(user_settings.router, dependencies=[Depends(get_current_user)])
    app.include_router(github.router)

    return app
