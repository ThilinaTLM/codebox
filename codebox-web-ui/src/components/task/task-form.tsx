import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useCreateTask } from "@/hooks/queries"
import { toast } from "sonner"

export function TaskForm() {
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
          navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })
        },
        onError: () => {
          toast.error("Failed to create task")
        },
      },
    )
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Create Task</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              placeholder="Describe what the agent should do..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[120px]"
              required
            />
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" type="button" className="text-xs text-muted-foreground">
                {showAdvanced ? "Hide" : "Show"} advanced options
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  placeholder="e.g. openai/gpt-4o (leave blank for default)"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="system-prompt">System Prompt</Label>
                <Textarea
                  id="system-prompt"
                  placeholder="Custom system prompt (optional)"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Button type="submit" disabled={createTask.isPending || !title.trim() || !prompt.trim()}>
            {createTask.isPending ? "Creating..." : "Create & Start"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
