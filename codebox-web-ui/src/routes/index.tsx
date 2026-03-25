import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TaskCard } from "@/components/task/task-card"
import { TaskStatusBadge } from "@/components/task/task-status-badge"
import { useTasks } from "@/hooks/queries"
import { TaskStatus } from "@/lib/types"
import type { Task } from "@/lib/types"
import { formatDistanceToNow } from "date-fns"

export const Route = createFileRoute("/")({ component: Dashboard })

function Dashboard() {
  const { data: tasks, isLoading } = useTasks()

  if (isLoading) return <DashboardSkeleton />

  const all = tasks ?? []
  const running = all.filter(
    (t) =>
      t.status === TaskStatus.RUNNING ||
      t.status === TaskStatus.STARTING ||
      t.status === TaskStatus.QUEUED,
  )
  const completed = all.filter((t) => t.status === TaskStatus.COMPLETED)
  const failed = all.filter((t) => t.status === TaskStatus.FAILED)
  const recent = all.slice(0, 5)

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agent task overview
          </p>
        </div>
        <Button asChild>
          <Link to="/tasks/new">New Task</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={all.length} />
        <StatCard label="Active" value={running.length} accent />
        <StatCard label="Completed" value={completed.length} />
        <StatCard label="Failed" value={failed.length} destructive={failed.length > 0} />
      </div>

      {/* Active tasks */}
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Active Tasks
        </h2>
        {running.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No active tasks.{" "}
              <Link to="/tasks/new" className="text-primary underline underline-offset-4">
                Create one
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {running.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>

      {/* Recent tasks */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Recent Tasks
          </h2>
          {all.length > 5 && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tasks">View all</Link>
            </Button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No tasks yet
          </p>
        ) : (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {recent.map((task) => (
                <RecentTaskRow key={task.id} task={task} />
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}

// ── Stat Card ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
  destructive,
}: {
  label: string
  value: number
  accent?: boolean
  destructive?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <span
          className={`text-3xl font-semibold tabular-nums ${
            destructive
              ? "text-destructive"
              : accent
                ? "text-primary"
                : "text-foreground"
          }`}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  )
}

// ── Recent Task Row ─────────────────────────────────────────

function RecentTaskRow({ task }: { task: Task }) {
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
        </p>
      </div>
      <TaskStatusBadge status={task.status} />
    </Link>
  )
}

// ── Loading skeleton ────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-8 p-6">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  )
}
