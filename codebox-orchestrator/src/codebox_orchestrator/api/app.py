"""FastAPI application factory -- composition root."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

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

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:  # noqa: PLR0915

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # noqa: PLR0915
        # --- Database setup ---
        # Import GitHub ORM models so they register with Base.metadata
        import codebox_orchestrator.integration.github.infrastructure.orm_models  # noqa: F401, PLC0415
        from codebox_orchestrator.box.infrastructure.orm_models import (  # noqa: PLC0415
            Base as BoxBase,
        )
        from codebox_orchestrator.shared.persistence.engine import (  # noqa: PLC0415
            async_session_factory,
            engine,
        )
        from codebox_orchestrator.shared.persistence.migrations import (  # noqa: PLC0415
            run_migrations,
        )

        if DATABASE_URL.startswith("sqlite"):
            db_path = DATABASE_URL.split("///", 1)[-1]
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        await run_migrations(engine)
        async with engine.begin() as conn:
            await conn.run_sync(BoxBase.metadata.create_all)

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
        from codebox_orchestrator.box.infrastructure.box_repository import (  # noqa: PLC0415
            SqlAlchemyBoxRepository,
        )
        from codebox_orchestrator.box.infrastructure.event_publisher import (  # noqa: PLC0415
            EventPublisherAdapter,
        )
        from codebox_orchestrator.compute.docker.docker_adapter import (  # noqa: PLC0415
            DockerRuntime,
        )

        box_repo = SqlAlchemyBoxRepository(async_session_factory)
        event_publisher = EventPublisherAdapter(relay, global_broadcast)
        container_runtime = DockerRuntime()
        registry = CallbackRegistry()
        agent_connections = AgentConnectionAdapter(registry)

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

        create_box_handler = CreateBoxHandler(box_repo, event_publisher)
        stop_box_handler = StopBoxHandler(
            box_repo, container_runtime, agent_connections, event_publisher
        )
        restart_box_handler = RestartBoxHandler(box_repo, event_publisher)
        delete_box_handler = DeleteBoxHandler(
            box_repo, container_runtime, event_publisher, stop_box_handler
        )
        cancel_box_handler = CancelBoxHandler(agent_connections)

        # --- Application layer: Box queries ---
        from codebox_orchestrator.box.application.queries.get_box import (  # noqa: PLC0415
            GetBoxHandler,
        )
        from codebox_orchestrator.box.application.queries.get_box_messages import (  # noqa: PLC0415
            GetBoxMessagesHandler,
        )
        from codebox_orchestrator.box.application.queries.list_boxes import (  # noqa: PLC0415
            ListBoxesHandler,
        )

        get_box_handler = GetBoxHandler(box_repo)
        list_boxes_handler = ListBoxesHandler(box_repo)
        get_box_messages_handler = GetBoxMessagesHandler(box_repo)

        # --- Application layer: Agent commands & queries ---
        from codebox_orchestrator.agent.application.commands.handle_sandbox_event import (  # noqa: PLC0415
            HandleSandboxEventHandler,
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

        send_message_handler = SendMessageHandler(box_repo, event_publisher, agent_connections)
        send_exec_handler = SendExecHandler(box_repo, event_publisher, agent_connections)
        event_handler = HandleSandboxEventHandler(box_repo, event_publisher, registry)
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
            repo=box_repo,
            runtime=container_runtime,
            connections=agent_connections,
            publisher=event_publisher,
            send_message_fn=send_message_handler.execute,
            send_exec_and_wait_fn=send_exec_handler.execute_and_wait,
            create_callback_token_fn=create_callback_token,
        )

        # --- GitHub integration (optional) ---
        webhook_handler = None
        installation_service = None
        if github_enabled():
            from codebox_orchestrator.integration.github.application.installation_service import (  # noqa: PLC0415
                GitHubInstallationService,
            )
            from codebox_orchestrator.integration.github.application.webhook_handler import (  # noqa: PLC0415
                GitHubWebhookHandler,
            )
            from codebox_orchestrator.integration.github.infrastructure.github_api_client import (  # noqa: PLC0415
                GitHubApiClient,
            )
            from codebox_orchestrator.integration.github.infrastructure.github_repository import (  # noqa: PLC0415
                SqlAlchemyGitHubRepository,
            )

            api_client = GitHubApiClient(
                app_id=GITHUB_APP_ID,
                private_key=Path(GITHUB_APP_PRIVATE_KEY_PATH).read_text(),  # noqa: ASYNC240
                webhook_secret=GITHUB_WEBHOOK_SECRET.encode(),
                app_slug=GITHUB_APP_SLUG,
                bot_name=GITHUB_BOT_NAME,
            )
            github_repo = SqlAlchemyGitHubRepository(async_session_factory)
            webhook_handler = GitHubWebhookHandler(api_client, github_repo)
            installation_service = GitHubInstallationService(api_client, github_repo)
            # Wire GitHub into lifecycle for setup commands
            lifecycle._github_service = installation_service  # noqa: SLF001

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
            repo=box_repo,
        )

        # --- Store everything in app.state ---
        app.state.create_box_handler = create_box_handler
        app.state.stop_box_handler = stop_box_handler
        app.state.restart_box_handler = restart_box_handler
        app.state.delete_box_handler = delete_box_handler
        app.state.cancel_box_handler = cancel_box_handler
        app.state.get_box_handler = get_box_handler
        app.state.list_boxes_handler = list_boxes_handler
        app.state.get_box_messages_handler = get_box_messages_handler
        app.state.send_message_handler = send_message_handler
        app.state.send_exec_handler = send_exec_handler
        app.state.list_files_handler = list_files_handler
        app.state.read_file_handler = read_file_handler
        app.state.lifecycle_service = lifecycle
        app.state.container_runtime = container_runtime
        app.state.relay_service = relay
        app.state.global_broadcast = global_broadcast
        app.state.webhook_handler = webhook_handler
        app.state.installation_service = installation_service
        # Keep session factory for any direct DB access needs
        app.state._sf = async_session_factory  # noqa: SLF001

        yield

        # --- Shutdown ---
        await grpc_server.stop(grace=5)
        await lifecycle.shutdown()
        await engine.dispose()

    app = FastAPI(
        title="Codebox Orchestrator",
        version="0.4.0",
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
        boxes,
        containers,
        github,
        models,
        sse,
    )

    app.include_router(boxes.router)
    app.include_router(containers.router)
    app.include_router(models.router)
    app.include_router(sse.router)
    app.include_router(github.router)

    return app
