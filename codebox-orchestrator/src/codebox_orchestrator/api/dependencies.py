"""FastAPI dependency injection for DDD handlers."""

from __future__ import annotations

from fastapi import Request

# Box commands
from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
from codebox_orchestrator.box.application.commands.stop_box import StopBoxHandler
from codebox_orchestrator.box.application.commands.restart_box import RestartBoxHandler
from codebox_orchestrator.box.application.commands.delete_box import DeleteBoxHandler
from codebox_orchestrator.box.application.commands.cancel_box import CancelBoxHandler

# Box queries
from codebox_orchestrator.box.application.queries.get_box import GetBoxHandler
from codebox_orchestrator.box.application.queries.list_boxes import ListBoxesHandler
from codebox_orchestrator.box.application.queries.get_box_events import GetBoxEventsHandler
from codebox_orchestrator.box.application.queries.get_box_messages import GetBoxMessagesHandler

# Box lifecycle
from codebox_orchestrator.box.application.services.box_lifecycle import BoxLifecycleService

# Agent commands & queries
from codebox_orchestrator.agent.application.commands.send_message import SendMessageHandler
from codebox_orchestrator.agent.application.commands.send_exec import SendExecHandler
from codebox_orchestrator.agent.application.queries.box_files import ListFilesHandler, ReadFileHandler

# Compute
from codebox_orchestrator.compute.docker.docker_adapter import DockerRuntime

# Integration
from codebox_orchestrator.integration.github.application.webhook_handler import GitHubWebhookHandler
from codebox_orchestrator.integration.github.application.installation_service import GitHubInstallationService

# Shared messaging (for SSE direct subscription)
from codebox_orchestrator.shared.messaging.relay import RelayService
from codebox_orchestrator.shared.messaging.global_broadcast import GlobalBroadcastService


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


def get_get_box(request: Request) -> GetBoxHandler:
    return request.app.state.get_box_handler


def get_list_boxes(request: Request) -> ListBoxesHandler:
    return request.app.state.list_boxes_handler


def get_box_events(request: Request) -> GetBoxEventsHandler:
    return request.app.state.get_box_events_handler


def get_box_messages(request: Request) -> GetBoxMessagesHandler:
    return request.app.state.get_box_messages_handler


def get_lifecycle(request: Request) -> BoxLifecycleService:
    return request.app.state.lifecycle_service


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
