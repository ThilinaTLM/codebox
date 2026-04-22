import type { AgentActivity } from "@/hooks/useAgentActivity"
import { Activity, BoxOutcome, ContainerStatus } from "@/net/http/types"
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

const outcomeLabels: Record<BoxOutcome, string> = {
  [BoxOutcome.COMPLETED]: "Completed",
  [BoxOutcome.UNABLE_TO_PROCEED]: "Unable to proceed",
}

const outcomeDotColors: Record<BoxOutcome, string> = {
  [BoxOutcome.COMPLETED]: "bg-state-completed",
  [BoxOutcome.UNABLE_TO_PROCEED]: "bg-state-error",
}

interface BoxStatusBadgeProps {
  containerStatus: ContainerStatus
  boxActivity?: Activity
  boxOutcome?: BoxOutcome | null
  activity?: AgentActivity
}

export function BoxStatusBadge({
  containerStatus,
  boxActivity,
  boxOutcome,
  activity,
}: BoxStatusBadgeProps) {
  if (activity) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusDot color={STATE_DOT_COLORS[activity.state]} animate={activity.animate} />
        {activity.label}
      </span>
    )
  }

  const config = containerConfig[containerStatus]

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

  if (
    containerStatus === ContainerStatus.STOPPED &&
    boxOutcome === BoxOutcome.COMPLETED
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

export function BoxOutcomeBadge({ status }: { status: BoxOutcome }) {
  const label = outcomeLabels[status]
  if (!label) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <StatusDot color={outcomeDotColors[status]} />
      {label}
    </span>
  )
}
