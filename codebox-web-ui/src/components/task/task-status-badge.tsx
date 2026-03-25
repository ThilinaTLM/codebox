import { Badge } from "@/components/ui/badge"
import { TaskStatus } from "@/lib/types"

const statusConfig: Record<
  TaskStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  [TaskStatus.QUEUED]: { label: "Queued", variant: "outline" },
  [TaskStatus.STARTING]: { label: "Starting", variant: "secondary" },
  [TaskStatus.RUNNING]: { label: "Running", variant: "default" },
  [TaskStatus.WAITING_FOR_FEEDBACK]: { label: "Waiting", variant: "secondary" },
  [TaskStatus.COMPLETED]: { label: "Completed", variant: "default" },
  [TaskStatus.FAILED]: { label: "Failed", variant: "destructive" },
  [TaskStatus.CANCELLED]: { label: "Cancelled", variant: "outline" },
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = statusConfig[status] ?? { label: status, variant: "outline" as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
