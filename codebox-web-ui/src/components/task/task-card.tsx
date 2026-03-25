import { Link } from "@tanstack/react-router"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TaskStatusBadge } from "./task-status-badge"
import type { Task } from "@/lib/types"
import { formatDistanceToNow } from "date-fns"

export function TaskCard({ task }: { task: Task }) {
  return (
    <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="block">
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="truncate text-sm font-medium">
              {task.title}
            </CardTitle>
            <TaskStatusBadge status={task.status} />
          </div>
          <CardDescription className="line-clamp-2 text-xs">
            {task.prompt}
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </p>
        </CardHeader>
      </Card>
    </Link>
  )
}
