import { Badge } from "@/components/ui/badge"
import { TaskStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const statusConfig: Record<
  TaskStatus,
  { label: string; className: string; dot?: boolean }
> = {
  [TaskStatus.QUEUED]: {
    label: "Queued",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  [TaskStatus.STARTING]: {
    label: "Starting",
    className: "border-success/30 bg-success/10 text-success",
    dot: true,
  },
  [TaskStatus.RUNNING]: {
    label: "Running",
    className: "border-success/30 bg-success/10 text-success",
    dot: true,
  },
  [TaskStatus.WAITING_FOR_FEEDBACK]: {
    label: "Waiting",
    className: "border-warning/30 bg-warning/15 text-warning",
    dot: true,
  },
  [TaskStatus.COMPLETED]: {
    label: "Completed",
    className: "border-success/20 bg-success/5 text-success/80",
  },
  [TaskStatus.FAILED]: {
    label: "Failed",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  [TaskStatus.CANCELLED]: {
    label: "Cancelled",
    className: "border-muted-foreground/20 bg-muted text-muted-foreground",
  },
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = statusConfig[status] ?? {
    label: status,
    className: "",
  }
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-mono text-[10px]", config.className)}
    >
      {config.dot && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {config.label}
    </Badge>
  )
}
