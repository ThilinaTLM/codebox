import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useCreateBox } from "@/net/query"

interface CreateAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateAgentDialog({
  open,
  onOpenChange,
}: CreateAgentDialogProps) {
  const navigate = useNavigate()
  const createMutation = useCreateBox()

  const [name, setName] = useState("")
  const [initialPrompt, setInitialPrompt] = useState("")

  const handleCreate = () => {
    createMutation.mutate(
      {
        name: name.trim() || undefined,
        initial_prompt: initialPrompt.trim() || undefined,
      },
      {
        onSuccess: (box) => {
          toast.success("Agent created")
          onOpenChange(false)
          setName("")
          setInitialPrompt("")
          navigate({ to: "/boxes/$boxId", params: { boxId: box.id } })
        },
        onError: () => toast.error("Failed to create agent"),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Create Agent
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="agent-name" className="text-xs text-ghost uppercase tracking-wider font-terminal">
              Name
            </Label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-generated if empty"
              className="h-9 w-full rounded-lg border border-border bg-inset px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          {/* Model */}
          <div className="grid gap-1.5">
            <Label htmlFor="agent-model" className="text-xs text-ghost uppercase tracking-wider font-terminal">
              Model
            </Label>
            <input
              id="agent-model"
              type="text"
              value="default"
              disabled
              className="h-9 w-full rounded-lg border border-border bg-inset px-3 py-1 text-sm text-foreground font-terminal opacity-60 cursor-not-allowed outline-none"
            />
          </div>

          {/* Initial prompt */}
          <div className="grid gap-1.5">
            <Label htmlFor="agent-prompt" className="text-xs text-ghost uppercase tracking-wider font-terminal">
              Initial Prompt
            </Label>
            <textarea
              id="agent-prompt"
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="What should the agent work on?"
              rows={4}
              className="w-full rounded-lg border border-border bg-inset px-3 py-2 text-sm text-foreground font-terminal placeholder:text-muted-foreground outline-none transition-colors resize-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="bg-primary text-primary-foreground"
          >
            Create Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
