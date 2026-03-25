import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { TaskCard } from "@/components/task/TaskCard"
import { TaskStatusBadge } from "@/components/task/TaskStatusBadge"
import { useTasks, useCreateTask } from "@/net/query"
import { TaskStatus } from "@/net/http/types"
import type { Task } from "@/net/http/types"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

export const Route = createFileRoute("/")({ component: Dashboard })

function Dashboard() {
  const { data: tasks, isLoading } = useTasks()

  if (isLoading) return <DashboardSkeleton />

  const all = tasks ?? []
  const running = all.filter(
    (t) =>
      t.status === TaskStatus.RUNNING ||
      t.status === TaskStatus.STARTING ||
      t.status === TaskStatus.QUEUED ||
      t.status === TaskStatus.WAITING_FOR_FEEDBACK,
  )
  const completed = all.filter((t) => t.status === TaskStatus.COMPLETED)
  const failed = all.filter((t) => t.status === TaskStatus.FAILED)
  const recent = all.slice(0, 8)

  return (
    <div className="flex flex-col">
      {/* Stat bar */}
      <div className="flex items-center gap-8 border-b px-8 py-4 text-sm">
        <StatItem label="Tasks" value={all.length} />
        <StatItem label="Active" value={running.length} color="text-success" pulse={running.length > 0} />
        <StatItem label="Completed" value={completed.length} />
        <StatItem label="Failed" value={failed.length} color={failed.length > 0 ? "text-destructive" : undefined} />
      </div>

      {/* Quick launch */}
      <QuickLaunch />

      <div className="space-y-8 p-8">
        {/* Active tasks */}
        {running.length > 0 && (
          <section>
            <h2 className="mb-4 text-base font-semibold text-muted-foreground">
              Active Tasks
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {running.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        )}

        {/* Recent tasks */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-muted-foreground">
              Recent Tasks
            </h2>
            {all.length > 8 && (
              <Button variant="ghost" size="sm" asChild className="text-sm">
                <Link to="/tasks">View all</Link>
              </Button>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed py-16 text-center">
              <p className="text-sm text-muted-foreground">
                No tasks yet. Use the quick launcher above or press{" "}
                <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">New Task</kbd>
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border shadow-sm">
              {recent.map((task, i) => (
                <RecentTaskRow key={task.id} task={task} isLast={i === recent.length - 1} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// ── Quick Launch ──────────────────────────────────────────────

function QuickLaunch() {
  const [prompt, setPrompt] = useState("")
  const navigate = useNavigate()
  const createTask = useCreateTask()

  const handleLaunch = () => {
    const trimmed = prompt.trim()
    if (!trimmed) return

    const title = trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed

    createTask.mutate(
      { title, prompt: trimmed },
      {
        onSuccess: (task) => {
          toast.success("Task launched")
          setPrompt("")
          navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })
        },
        onError: () => toast.error("Failed to create task"),
      },
    )
  }

  return (
    <div className="bg-grid border-b px-8 py-6">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <Input
          placeholder="Describe a task to run..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleLaunch()
            }
          }}
          className="flex-1 text-base"
        />
        <Button
          onClick={handleLaunch}
          disabled={!prompt.trim() || createTask.isPending}
        >
          {createTask.isPending ? "..." : "Run"}
        </Button>
      </div>
    </div>
  )
}

// ── Stat Item ─────────────────────────────────────────────────

function StatItem({
  label,
  value,
  color,
  pulse,
}: {
  label: string
  value: number
  color?: string
  pulse?: boolean
}) {
  return (
    <span className={`flex items-center gap-2 ${color ?? "text-muted-foreground"}`}>
      {pulse && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      <span>{label}</span>
      <span className="text-base font-bold text-foreground">{value}</span>
    </span>
  )
}

// ── Recent Task Row ─────────────────────────────────────────

function RecentTaskRow({ task, isLast }: { task: Task; isLast: boolean }) {
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className={`flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50 ${!isLast ? "border-b" : ""}`}
    >
      <span className="font-mono text-xs text-muted-foreground/50">
        {task.id.slice(0, 8)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {task.title}
      </span>
      {task.model && (
        <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
          {task.model}
        </span>
      )}
      <span className="text-sm text-muted-foreground">
        {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
      </span>
      <TaskStatusBadge status={task.status} />
    </Link>
  )
}

// ── Loading skeleton ────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-8 border-b px-8 py-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-24" />
        ))}
      </div>
      <div className="border-b px-8 py-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-16" />
        </div>
      </div>
      <div className="space-y-4 p-8">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
