"""FastAPI dependency injection."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request  # noqa: TC002

if TYPE_CHECKING:
    from codebox_orchestrator.agent.application.commands.send_exec import SendExecHandler
    from codebox_orchestrator.agent.application.commands.send_message import SendMessageHandler
    from codebox_orchestrator.agent.application.queries.box_files import (
        ListFilesHandler,
        ReadFileHandler,
    )
    from codebox_orchestrator.auth.service import AuthService
    from codebox_orchestrator.box.application.commands.cancel_box import CancelBoxHandler
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.box.application.commands.delete_box import DeleteBoxHandler
    from codebox_orchestrator.box.application.commands.restart_box import RestartBoxHandler
    from codebox_orchestrator.box.application.commands.stop_box import StopBoxHandler
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.compute.docker.docker_adapter import DockerRuntime
    from codebox_orchestrator.integration.github.application.installation_service import (
        GitHubInstallationService,
    )
    from codebox_orchestrator.integration.github.application.webhook_handler import (
        GitHubWebhookHandler,
    )
    from codebox_orchestrator.shared.messaging.global_broadcast import GlobalBroadcastService
    from codebox_orchestrator.shared.messaging.relay import RelayService


def get_create_box(request: Request) -> CreateBoxHandler:
    return request.app.state.create_box_handler


def get_stop_box(request: Request) -> StopBoxHandler:
    return request.app.state.stop_box_handler


def get_restart_box(request: Request) -> RestartBoxHandler:
    return request.app.state.restart_box_handler


def get_delete_box(request: Request) -> DeleteBoxHandler:
    return request.app.state.delete_box_handler


def get_cancel_box(request: Request) -> CancelBoxHandler:
    return request.app.state.cancel_box_handler


def get_query_service(request: Request) -> BoxQueryService:
    return request.app.state.query_service


def get_send_message(request: Request) -> SendMessageHandler:
    return request.app.state.send_message_handler


def get_send_exec(request: Request) -> SendExecHandler:
    return request.app.state.send_exec_handler


def get_list_files(request: Request) -> ListFilesHandler:
    return request.app.state.list_files_handler


def get_read_file(request: Request) -> ReadFileHandler:
    return request.app.state.read_file_handler


def get_runtime(request: Request) -> DockerRuntime:
    return request.app.state.container_runtime


def get_webhook_handler(request: Request) -> GitHubWebhookHandler | None:
    return getattr(request.app.state, "webhook_handler", None)


def get_installation_service(request: Request) -> GitHubInstallationService | None:
    return getattr(request.app.state, "installation_service", None)


def get_relay(request: Request) -> RelayService:
    return request.app.state.relay_service


def get_global_broadcast(request: Request) -> GlobalBroadcastService:
    return request.app.state.global_broadcast


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth_service
