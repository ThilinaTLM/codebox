"""FastAPI dependency injection helpers.

Each function retrieves a pre-built service from ``request.app.state``
(populated in the application lifespan in ``app.py``).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request  # noqa: TC002  # runtime-required: FastAPI inspects signatures

if TYPE_CHECKING:
    from codebox_orchestrator.agent.application.commands.send_exec import SendExecHandler
    from codebox_orchestrator.agent.application.commands.send_message import SendMessageHandler
    from codebox_orchestrator.auth.service import AuthService
    from codebox_orchestrator.box.application.commands.cancel_box import CancelBoxHandler
    from codebox_orchestrator.box.application.commands.create_box import CreateBoxHandler
    from codebox_orchestrator.box.application.commands.delete_box import DeleteBoxHandler
    from codebox_orchestrator.box.application.commands.restart_box import RestartBoxHandler
    from codebox_orchestrator.box.application.commands.stop_box import StopBoxHandler
    from codebox_orchestrator.box.application.services.box_query import BoxQueryService
    from codebox_orchestrator.box.infrastructure.box_repository import BoxRepository
    from codebox_orchestrator.compute.docker.docker_adapter import DockerRuntime
    from codebox_orchestrator.integration.github.application.client_manager import (
        GitHubClientManager,
    )
    from codebox_orchestrator.integration.github.infrastructure.github_repository import (
        SqlAlchemyGitHubRepository,
    )
    from codebox_orchestrator.llm_profile.service import LLMProfileService
    from codebox_orchestrator.project.service import (
        ProjectLifecycleService,
        ProjectService,
    )
    from codebox_orchestrator.project_settings.service import ProjectSettingsService
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


def get_runtime(request: Request) -> DockerRuntime:
    return request.app.state.container_runtime


def get_relay(request: Request) -> RelayService:
    return request.app.state.relay_service


def get_global_broadcast(request: Request) -> GlobalBroadcastService:
    return request.app.state.global_broadcast


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth_service


def get_llm_profile_service(request: Request) -> LLMProfileService:
    return request.app.state.llm_profile_service


def get_project_settings_service(request: Request) -> ProjectSettingsService:
    return request.app.state.project_settings_service


def get_github_client_manager(request: Request) -> GitHubClientManager:
    return request.app.state.github_client_manager


def get_project_service(request: Request) -> ProjectService:
    return request.app.state.project_service


def get_box_repository(request: Request) -> BoxRepository:
    return request.app.state.box_repository


def get_github_repository(request: Request) -> SqlAlchemyGitHubRepository:
    return request.app.state.github_repository


def get_project_lifecycle_service(request: Request) -> ProjectLifecycleService:
    return request.app.state.project_lifecycle_service
