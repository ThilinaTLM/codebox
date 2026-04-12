import type { AgentActivity } from "@/hooks/useAgentActivity"
import { Activity, ContainerStatus, TaskOutcome } from "@/net/http/types"
import { STATE_DOT_COLORS } from "@/lib/state-colors"
import { StatusDot } from "@/components/ui/status-dot"

const containerConfig: Record<
  ContainerStatus,
  {
    label: string
    dotColor: string
    animate?: boolean
  }
> = {
  [ContainerStatus.STARTING]: {
    label: "Starting",
    dotColor: "bg-state-starting",
    animate: true,
  },
  [ContainerStatus.RUNNING]: {
    label: "Running",
    dotColor: "bg-state-completed",
  },
  [ContainerStatus.STOPPED]: {
    label: "Stopped",
    dotColor: "bg-state-idle",
  },
}

const activityLabels: Record<Activity, string> = {
  [Activity.IDLE]: "Idle",
  [Activity.AGENT_WORKING]: "Working",
  [Activity.EXEC_SHELL]: "Running command",
}

const activityDotColors: Record<Activity, string> = {
  [Activity.IDLE]: "bg-state-idle",
  [Activity.AGENT_WORKING]: "bg-state-writing",
  [Activity.EXEC_SHELL]: "bg-state-thinking",
}

const outcomeLabels: Record<TaskOutcome, string> = {
  [TaskOutcome.IN_PROGRESS]: "In progress",
  [TaskOutcome.COMPLETED]: "Completed",
  [TaskOutcome.NEED_CLARIFICATION]: "Needs clarification",
  [TaskOutcome.UNABLE_TO_PROCEED]: "Unable to proceed",
  [TaskOutcome.NOT_ENOUGH_CONTEXT]: "Not enough context",
}

const outcomeDotColors: Record<TaskOutcome, string> = {
  [TaskOutcome.IN_PROGRESS]: "bg-state-writing",
  [TaskOutcome.COMPLETED]: "bg-state-completed",
  [TaskOutcome.NEED_CLARIFICATION]: "bg-state-thinking",
  [TaskOutcome.UNABLE_TO_PROCEED]: "bg-state-error",
  [TaskOutcome.NOT_ENOUGH_CONTEXT]: "bg-state-error",
}

interface BoxStatusBadgeProps {
  containerStatus: ContainerStatus
  boxActivity?: Activity
  taskOutcome?: TaskOutcome | null
  activity?: AgentActivity
}

export function BoxStatusBadge({
  containerStatus,
  boxActivity,
  taskOutcome,
  activity,
}: BoxStatusBadgeProps) {
  // If we have a live activity override, use it
  if (activity) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusDot color={STATE_DOT_COLORS[activity.state]} animate={activity.animate} />
        {activity.label}
      </span>
    )
  }

  const config = containerConfig[containerStatus]

  // For running containers, show activity as the label
  if (
    containerStatus === ContainerStatus.RUNNING &&
    boxActivity &&
    boxActivity !== Activity.IDLE
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusDot color={activityDotColors[boxActivity]} animate />
        {activityLabels[boxActivity]}
      </span>
    )
  }

  // For stopped containers with completed outcome, show that
  if (
    containerStatus === ContainerStatus.STOPPED &&
    taskOutcome === TaskOutcome.COMPLETED
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusDot color="bg-state-completed" />
        Completed
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <StatusDot color={config.dotColor} animate={config.animate} />
      {config.label}
    </span>
  )
}

export function TaskOutcomeBadge({ status }: { status: TaskOutcome }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <StatusDot color={outcomeDotColors[status]} />
      {outcomeLabels[status]}
    </span>
  )
}


