"""Mappers between Box ORM models and domain entities."""

from __future__ import annotations

from codebox_orchestrator.box.domain import entities as domain
from codebox_orchestrator.box.domain.enums import AgentReportStatus, ContainerStatus, TaskStatus
from codebox_orchestrator.box.infrastructure import orm_models as orm


def box_to_domain(db_box: orm.Box) -> domain.Box:
    """Convert ORM Box to domain Box entity."""
    return domain.Box(
        id=db_box.id,
        name=db_box.name,
        model=db_box.model,
        container_status=db_box.container_status,
        task_status=db_box.task_status,
        stop_reason=db_box.stop_reason,
        agent_report_status=db_box.agent_report_status,
        agent_report_message=db_box.agent_report_message,
        system_prompt=db_box.system_prompt,
        initial_prompt=db_box.initial_prompt,
        container_id=db_box.container_id,
        container_name=db_box.container_name,
        session_id=db_box.session_id,
        workspace_path=db_box.workspace_path,
        created_at=db_box.created_at,
        started_at=db_box.started_at,
        completed_at=db_box.completed_at,
        trigger=db_box.trigger,
        github_installation_id=db_box.github_installation_id,
        github_repo=db_box.github_repo,
        github_issue_number=db_box.github_issue_number,
        github_trigger_url=db_box.github_trigger_url,
        github_branch=db_box.github_branch,
        github_pr_number=db_box.github_pr_number,
    )


def domain_to_orm(box: domain.Box) -> orm.Box:
    """Convert domain Box to ORM Box (for inserts)."""
    return orm.Box(
        id=box.id,
        name=box.name,
        model=box.model,
        container_status=box.container_status,
        task_status=box.task_status,
        stop_reason=box.stop_reason,
        agent_report_status=box.agent_report_status,
        agent_report_message=box.agent_report_message,
        system_prompt=box.system_prompt,
        initial_prompt=box.initial_prompt,
        container_id=box.container_id,
        container_name=box.container_name,
        session_id=box.session_id,
        workspace_path=box.workspace_path,
        created_at=box.created_at,
        started_at=box.started_at,
        completed_at=box.completed_at,
        trigger=box.trigger,
        github_installation_id=box.github_installation_id,
        github_repo=box.github_repo,
        github_issue_number=box.github_issue_number,
        github_trigger_url=box.github_trigger_url,
        github_branch=box.github_branch,
        github_pr_number=box.github_pr_number,
    )


def update_orm_from_domain(db_box: orm.Box, box: domain.Box) -> None:
    """Update an existing ORM Box from a domain Box (for updates)."""
    db_box.name = box.name
    db_box.model = box.model
    db_box.container_status = box.container_status
    db_box.task_status = box.task_status
    db_box.stop_reason = box.stop_reason
    db_box.agent_report_status = box.agent_report_status
    db_box.agent_report_message = box.agent_report_message
    db_box.system_prompt = box.system_prompt
    db_box.initial_prompt = box.initial_prompt
    db_box.container_id = box.container_id
    db_box.container_name = box.container_name
    db_box.session_id = box.session_id
    db_box.workspace_path = box.workspace_path
    db_box.started_at = box.started_at
    db_box.completed_at = box.completed_at
    db_box.trigger = box.trigger
    db_box.github_installation_id = box.github_installation_id
    db_box.github_repo = box.github_repo
    db_box.github_issue_number = box.github_issue_number
    db_box.github_trigger_url = box.github_trigger_url
    db_box.github_branch = box.github_branch
    db_box.github_pr_number = box.github_pr_number


def box_event_to_domain(db_event: orm.BoxEvent) -> domain.BoxEvent:
    """Convert ORM BoxEvent to domain BoxEvent entity."""
    return domain.BoxEvent(
        id=db_event.id,
        box_id=db_event.box_id,
        event_type=db_event.event_type,
        data=db_event.data,
        created_at=db_event.created_at,
    )


def box_message_to_domain(db_msg: orm.BoxMessage) -> domain.BoxMessage:
    """Convert ORM BoxMessage to domain BoxMessage entity."""
    return domain.BoxMessage(
        id=db_msg.id,
        box_id=db_msg.box_id,
        seq=db_msg.seq,
        role=db_msg.role,
        content=db_msg.content,
        tool_calls=db_msg.tool_calls,
        tool_call_id=db_msg.tool_call_id,
        tool_name=db_msg.tool_name,
        metadata_json=db_msg.metadata_json,
        created_at=db_msg.created_at,
    )
