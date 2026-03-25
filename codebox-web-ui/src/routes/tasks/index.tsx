import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { TaskStatusBadge } from "@/components/task/TaskStatusBadge"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { useTasks } from "@/net/query"
import { TaskStatus } from "@/net/http/types"
import { formatDistanceToNow, differenceInSeconds, differenceInMinutes, differenceInHours } from "date-fns"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/tasks/")({ component: TaskHistoryPage })

const filterTabs = [
  { label: "All", value: "all" },
  { label: "Running", value: TaskStatus.RUNNING },
  { label: "Completed", value: TaskStatus.COMPLETED },
  { label: "Failed", value: TaskStatus.FAILED },
  { label: "Cancelled", value: TaskStatus.CANCELLED },
] as const

function TaskHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const { data: tasks, isLoading } = useTasks(
    statusFilter === "all" ? undefined : statusFilter,
  )

  return (
    <div className="flex flex-col">
      {/* Header with tabs */}
      <div className="flex items-center justify-between border-b px-8 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>
          <nav className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  statusFilter === tab.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1">
        {isLoading ? (
          <div className="space-y-1 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !tasks?.length ? (
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyTitle>No tasks found</EmptyTitle>
              <EmptyDescription>
                {statusFilter === "all"
                  ? "Create your first task to get started."
                  : `No ${statusFilter} tasks.`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px] text-xs font-medium">ID</TableHead>
                <TableHead className="text-xs font-medium">Title</TableHead>
                <TableHead className="text-xs font-medium">Model</TableHead>
                <TableHead className="text-xs font-medium">Status</TableHead>
                <TableHead className="text-xs font-medium">Duration</TableHead>
                <TableHead className="text-xs font-medium">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id} className="cursor-pointer">
                  <TableCell className="font-mono text-xs text-muted-foreground/60">
                    {task.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/tasks/$taskId"
                      params={{ taskId: task.id }}
                      className="text-sm font-medium hover:text-primary hover:underline"
                    >
                      {task.title}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {task.model}
                  </TableCell>
                  <TableCell>
                    <TaskStatusBadge status={task.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatDuration(task.started_at, task.completed_at, task.status)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(task.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
  _status: TaskStatus,
): string {
  if (!startedAt) return "-"
  const start = new Date(startedAt)
  const end = completedAt ? new Date(completedAt) : new Date()
  const secs = differenceInSeconds(end, start)
  if (secs < 60) return `${secs}s`
  const mins = differenceInMinutes(end, start)
  if (mins < 60) return `${mins}m`
  const hrs = differenceInHours(end, start)
  return `${hrs}h ${mins % 60}m`
}
