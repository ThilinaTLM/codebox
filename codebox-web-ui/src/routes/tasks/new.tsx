import { createFileRoute } from "@tanstack/react-router"
import { TaskForm } from "@/components/task/TaskForm"

export const Route = createFileRoute("/tasks/new")({ component: NewTaskPage })

function NewTaskPage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 font-mono text-lg font-semibold tracking-tight">New Task</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Describe what the agent should build or do.
      </p>
      <TaskForm />
    </div>
  )
}
