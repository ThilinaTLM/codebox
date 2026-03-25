import { createFileRoute, Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { TaskStatusBadge } from "@/components/task/TaskStatusBadge"
import { EventStream } from "@/components/task/EventStream"
import { FeedbackInput } from "@/components/task/FeedbackInput"
import { useTask, useCancelTask, useDeleteTask } from "@/net/query"
import { useTaskWebSocket } from "@/net/ws"
import { TaskStatus } from "@/net/http/types"
import { toast } from "sonner"
import { useNavigate } from "@tanstack/react-router"
import { SidebarTrigger } from "@/components/ui/sidebar"

export const Route = createFileRoute("/tasks/$taskId")({
  component: TaskDetailPage,
})

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const { data: task, isLoading } = useTask(taskId)
  const navigate = useNavigate()
  const cancelMutation = useCancelTask()
  const deleteMutation = useDeleteTask()

  const isActive =
    task?.status === TaskStatus.RUNNING ||
    task?.status === TaskStatus.STARTING ||
    task?.status === TaskStatus.QUEUED ||
    task?.status === TaskStatus.WAITING_FOR_FEEDBACK

  const { events, sendMessage, sendCancel, isConnected } = useTaskWebSocket({
    taskId,
    enabled: true,
  })

  if (isLoading) return <TaskDetailSkeleton />

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-sm text-muted-foreground">Task not found</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/tasks">Back to tasks</Link>
        </Button>
      </div>
    )
  }

  const handleCancel = () => {
    sendCancel()
    cancelMutation.mutate(taskId, {
      onSuccess: () => toast.success("Task cancelled"),
      onError: () => toast.error("Failed to cancel"),
    })
  }

  const handleDelete = () => {
    deleteMutation.mutate(taskId, {
      onSuccess: () => {
        toast.success("Task deleted")
        navigate({ to: "/tasks" })
      },
      onError: () => toast.error("Failed to delete"),
    })
  }

  return (
    <div className="flex h-svh flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <h1 className="truncate text-lg font-semibold">{task.title}</h1>
            <TaskStatusBadge status={task.status} />
            {isConnected && isActive && (
              <span className="flex items-center gap-1.5 text-xs text-success">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                </span>
                connected
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {task.model} &middot; {task.id.slice(0, 8)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              Cancel
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* Event stream */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <EventStream events={events} centered />
          </div>

          {/* Feedback input */}
          {isActive && (
            <>
              <Separator />
              <div className="p-4">
                <FeedbackInput taskId={taskId} onSend={sendMessage} />
              </div>
            </>
          )}
        </div>

        {/* Side panel */}
        <div className="hidden w-80 flex-shrink-0 border-l lg:block">
          <div className="space-y-4 p-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <DetailRow label="Status" value={task.status} />
                <DetailRow label="Model" value={task.model} mono />
                {task.container_name && (
                  <DetailRow label="Container" value={task.container_name} mono />
                )}
                {task.workspace_path && (
                  <DetailRow label="Workspace" value={task.workspace_path} mono />
                )}
                {task.created_at && (
                  <DetailRow label="Created" value={new Date(task.created_at).toLocaleString()} />
                )}
                {task.started_at && (
                  <DetailRow label="Started" value={new Date(task.started_at).toLocaleString()} />
                )}
                {task.completed_at && (
                  <DetailRow label="Finished" value={new Date(task.completed_at).toLocaleString()} />
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Prompt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {task.prompt}
                </p>
              </CardContent>
            </Card>

            {task.error_message && (
              <Card size="sm" className="border-destructive/30">
                <CardHeader>
                  <CardTitle className="text-xs font-medium uppercase tracking-wider text-destructive">
                    Error
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-destructive">
                    {task.error_message}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`truncate text-right ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  )
}

function TaskDetailSkeleton() {
  return (
    <div className="space-y-4 p-8">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-[400px] w-full rounded-lg" />
    </div>
  )
}
