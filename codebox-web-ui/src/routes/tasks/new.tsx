import { createFileRoute } from "@tanstack/react-router"
import { TaskForm } from "@/components/task/task-form"

export const Route = createFileRoute("/tasks/new")({ component: NewTaskPage })

function NewTaskPage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New Task</h1>
      <TaskForm />
    </div>
  )
}
