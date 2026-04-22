"""Box domain enums."""

from enum import StrEnum


class ContainerStatus(StrEnum):
    STARTING = "starting"
    RUNNING = "running"
    STOPPED = "stopped"


class Activity(StrEnum):
    IDLE = "idle"
    AGENT_WORKING = "agent_working"
    EXEC_SHELL = "exec_shell"


class BoxOutcome(StrEnum):
    COMPLETED = "completed"
    UNABLE_TO_PROCEED = "unable_to_proceed"
