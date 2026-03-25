import { Link } from "@tanstack/react-router"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { TaskStatusBadge } from "./TaskStatusBadge"
import { TaskStatus } from "@/net/http/types"
import type { Task } from "@/net/http/types"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

const statusBorderColor: Partial<Record<TaskStatus, string>> = {
  [TaskStatus.RUNNING]: "border-l-success/60",
  [TaskStatus.STARTING]: "border-l-success/60",
  [TaskStatus.QUEUED]: "border-l-warning/60",
  [TaskStatus.WAITING_FOR_FEEDBACK]: "border-l-warning/60",
  [TaskStatus.FAILED]: "border-l-destructive/60",
  [TaskStatus.COMPLETED]: "border-l-success/30",
}

export function TaskCard({ task }: { task: Task }) {
  return (
    <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="block">
      <Card
        className={cn(
          "border-l-2 transition-colors hover:bg-muted/50",
          statusBorderColor[task.status] ?? "border-l-border",
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-sm font-medium">
              {task.title}
            </span>
            <TaskStatusBadge status={task.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {task.prompt}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
            <span className="font-mono">{task.id.slice(0, 8)}</span>
            <span>&middot;</span>
            <span>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
