import type { AgentActivity } from "@/hooks/useAgentActivity"
import { Badge } from "@/components/ui/badge"
import { BoxStatus } from "@/net/http/types"

const statusConfig: Record<
  BoxStatus,
  {
    label: string
    variant: "default" | "secondary" | "destructive" | "outline"
    animate?: boolean
  }
> = {
  [BoxStatus.STARTING]: {
    label: "Starting",
    variant: "outline",
    animate: true,
  },
  [BoxStatus.RUNNING]: { label: "Running", variant: "default", animate: true },
  [BoxStatus.IDLE]: { label: "Idle", variant: "secondary" },
  [BoxStatus.COMPLETED]: { label: "Completed", variant: "outline" },
  [BoxStatus.FAILED]: { label: "Failed", variant: "destructive" },
  [BoxStatus.CANCELLED]: { label: "Cancelled", variant: "outline" },
  [BoxStatus.STOPPED]: { label: "Stopped", variant: "outline" },
}

const statusDot: Record<BoxStatus, string> = {
  [BoxStatus.STARTING]: "bg-warning",
  [BoxStatus.RUNNING]: "bg-success",
  [BoxStatus.IDLE]: "bg-muted-foreground/60",
  [BoxStatus.COMPLETED]: "bg-success",
  [BoxStatus.FAILED]: "bg-destructive",
  [BoxStatus.CANCELLED]: "bg-muted-foreground/40",
  [BoxStatus.STOPPED]: "bg-muted-foreground/40",
}

interface BoxStatusBadgeProps {
  status: BoxStatus
  isActive?: boolean
  activity?: AgentActivity
}

export function BoxStatusBadge({
  status,
  isActive,
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

  // Fallback: existing behavior (used on box list page, etc.)
  const effectiveStatus = isActive ? BoxStatus.RUNNING : status
  const config = statusConfig[effectiveStatus]

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  )
}
