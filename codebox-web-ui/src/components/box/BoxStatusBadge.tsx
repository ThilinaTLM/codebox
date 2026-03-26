import type { AgentActivity } from "@/hooks/useAgentActivity"
import {
  AgentReportStatus,
  ContainerStatus,
  TaskStatus,
} from "@/net/http/types"

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

const taskLabels: Record<TaskStatus, string> = {
  [TaskStatus.IDLE]: "Idle",
  [TaskStatus.AGENT_WORKING]: "Working",
  [TaskStatus.EXEC_SHELL]: "Running command",
}

const taskDotColors: Record<TaskStatus, string> = {
  [TaskStatus.IDLE]: "bg-state-idle",
  [TaskStatus.AGENT_WORKING]: "bg-state-writing",
  [TaskStatus.EXEC_SHELL]: "bg-state-thinking",
}

const reportLabels: Record<AgentReportStatus, string> = {
  [AgentReportStatus.IN_PROGRESS]: "In progress",
  [AgentReportStatus.COMPLETED]: "Completed",
  [AgentReportStatus.NEED_CLARIFICATION]: "Needs clarification",
  [AgentReportStatus.UNABLE_TO_PROCEED]: "Unable to proceed",
  [AgentReportStatus.NOT_ENOUGH_CONTEXT]: "Not enough context",
}

const reportDotColors: Record<AgentReportStatus, string> = {
  [AgentReportStatus.IN_PROGRESS]: "bg-state-writing",
  [AgentReportStatus.COMPLETED]: "bg-state-completed",
  [AgentReportStatus.NEED_CLARIFICATION]: "bg-state-thinking",
  [AgentReportStatus.UNABLE_TO_PROCEED]: "bg-state-error",
  [AgentReportStatus.NOT_ENOUGH_CONTEXT]: "bg-state-error",
}

function StatusDot({ color, animate }: { color: string; animate?: boolean }) {
  return (
    <span className="relative flex size-2">
      {animate && (
        <span
          className={`absolute inset-0 rounded-full ${color} animate-status-ping`}
        />
      )}
      <span className={`relative size-2 rounded-full ${color}`} />
    </span>
  )
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
    const activityDotColor = getActivityDotColor(activity.label)
    return (
      <span className="inline-flex items-center gap-1.5 font-terminal text-xs text-muted-foreground">
        <StatusDot color={activityDotColor} animate={activity.animate} />
        {activity.label}
      </span>
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
      <span className="inline-flex items-center gap-1.5 font-terminal text-xs text-muted-foreground">
        <StatusDot color={taskDotColors[taskStatus]} animate />
        {taskLabels[taskStatus]}
      </span>
    )
  }

  // For stopped containers with agent report, show that
  if (
    containerStatus === ContainerStatus.STOPPED &&
    agentReportStatus === AgentReportStatus.COMPLETED
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 font-terminal text-xs text-muted-foreground">
        <StatusDot color="bg-state-completed" />
        Completed
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-terminal text-xs text-muted-foreground">
      <StatusDot color={config.dotColor} animate={config.animate} />
      {config.label}
    </span>
  )
}

export function AgentReportBadge({
  status,
}: {
  status: AgentReportStatus
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-terminal text-xs text-muted-foreground">
      <StatusDot color={reportDotColors[status]} />
      {reportLabels[status]}
    </span>
  )
}

function getActivityDotColor(label: string): string {
  if (label.includes("Thinking")) return "bg-state-thinking"
  if (label.includes("Writing")) return "bg-state-writing"
  if (label.includes("Using")) return "bg-state-tool-use"
  if (label.includes("Working")) return "bg-state-writing"
  if (label.includes("Running")) return "bg-state-thinking"
  if (label === "Error") return "bg-state-error"
  if (label === "Stopped") return "bg-state-idle"
  if (label === "Starting") return "bg-state-starting"
  return "bg-state-idle"
}
