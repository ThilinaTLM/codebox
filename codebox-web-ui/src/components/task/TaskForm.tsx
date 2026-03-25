import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useCreateTask } from "@/net/query"
import { toast } from "sonner"

export function TaskForm({
  compact,
  onSuccess,
}: {
  compact?: boolean
  onSuccess?: () => void
}) {
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const navigate = useNavigate()
  const createTask = useCreateTask()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !prompt.trim()) return

    createTask.mutate(
      {
        title: title.trim(),
        prompt: prompt.trim(),
        model: model.trim() || undefined,
        system_prompt: systemPrompt.trim() || undefined,
      },
      {
        onSuccess: (task) => {
          toast.success("Task created")
          onSuccess?.()
          navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })
        },
        onError: () => {
          toast.error("Failed to create task")
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title" className="text-sm font-medium">Title</Label>
        <Input
          id="title"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="prompt" className="text-sm font-medium">Prompt</Label>
        <Textarea
          id="prompt"
          placeholder="Describe what the agent should do..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className={compact ? "min-h-[100px] text-sm" : "min-h-[140px] text-sm"}
          required
        />
      </div>

      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="sm" type="button" />}
          className="text-sm text-muted-foreground"
        >
          {showAdvanced ? "Hide advanced" : "Show advanced"}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="model" className="text-sm font-medium">Model</Label>
            <Input
              id="model"
              placeholder="e.g. openai/gpt-4o (leave blank for default)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="system-prompt" className="text-sm font-medium">System Prompt</Label>
            <Textarea
              id="system-prompt"
              placeholder="Custom system prompt (optional)"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Button type="submit" disabled={createTask.isPending || !title.trim() || !prompt.trim()}>
        {createTask.isPending ? "Creating..." : "Create & Start"}
      </Button>
    </form>
  )
}
