import type { AgentActivity } from "@/hooks/useAgentActivity"
import { Badge } from "@/components/ui/badge"
import {
  ContainerStatus,
  TaskStatus,
  AgentReportStatus,
} from "@/net/http/types"

const containerConfig: Record<
  ContainerStatus,
  {
    label: string
    variant: "default" | "secondary" | "destructive" | "outline"
    animate?: boolean
  }
> = {
  [ContainerStatus.STARTING]: {
    label: "Starting",
    variant: "outline",
    animate: true,
  },
  [ContainerStatus.RUNNING]: { label: "Running", variant: "default" },
  [ContainerStatus.STOPPED]: { label: "Stopped", variant: "outline" },
}

const taskLabels: Record<TaskStatus, string> = {
  [TaskStatus.IDLE]: "Idle",
  [TaskStatus.AGENT_WORKING]: "Working",
  [TaskStatus.EXEC_SHELL]: "Running command",
}

const reportLabels: Record<AgentReportStatus, string> = {
  [AgentReportStatus.IN_PROGRESS]: "In progress",
  [AgentReportStatus.COMPLETED]: "Completed",
  [AgentReportStatus.NEED_CLARIFICATION]: "Needs clarification",
  [AgentReportStatus.UNABLE_TO_PROCEED]: "Unable to proceed",
  [AgentReportStatus.NOT_ENOUGH_CONTEXT]: "Not enough context",
}

interface BoxStatusBadgeProps {
  containerStatus: ContainerStatus
  taskStatus?: TaskStatus
  agentReportStatus?: AgentReportStatus | null
  activity?: AgentActivity
}

export function BoxStatusBadge({
  containerStatus,
  taskStatus,
  agentReportStatus,
  activity,
}: BoxStatusBadgeProps) {
  // If we have a live activity override, use it
  if (activity) {
    return (
      <Badge variant="default" className="text-xs">
        {activity.label}
      </Badge>
    )
  }

  const config = containerConfig[containerStatus]

  // For running containers, show task status as the label
  if (
    containerStatus === ContainerStatus.RUNNING &&
    taskStatus &&
    taskStatus !== TaskStatus.IDLE
  ) {
    return (
      <Badge variant="default" className="text-xs">
        {taskLabels[taskStatus]}
      </Badge>
    )
  }

  // For stopped containers with agent report, show that
  if (
    containerStatus === ContainerStatus.STOPPED &&
    agentReportStatus === AgentReportStatus.COMPLETED
  ) {
    return (
      <Badge variant="outline" className="text-xs">
        Completed
      </Badge>
    )
  }

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  )
}

export function AgentReportBadge({
  status,
}: {
  status: AgentReportStatus
}) {
  const variant =
    status === AgentReportStatus.COMPLETED
      ? "outline"
      : status === AgentReportStatus.UNABLE_TO_PROCEED ||
          status === AgentReportStatus.NOT_ENOUGH_CONTEXT
        ? "destructive"
        : "secondary"

  return (
    <Badge variant={variant} className="text-xs">
      {reportLabels[status]}
    </Badge>
  )
}
