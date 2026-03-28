"""Box domain enums."""

from enum import Enum as PyEnum


class ContainerStatus(str, PyEnum):
    STARTING = "starting"
    RUNNING = "running"
    STOPPED = "stopped"


class Activity(str, PyEnum):
    IDLE = "idle"
    AGENT_WORKING = "agent_working"
    EXEC_SHELL = "exec_shell"


class TaskOutcome(str, PyEnum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    NEED_CLARIFICATION = "need_clarification"
    UNABLE_TO_PROCEED = "unable_to_proceed"
    NOT_ENOUGH_CONTEXT = "not_enough_context"
