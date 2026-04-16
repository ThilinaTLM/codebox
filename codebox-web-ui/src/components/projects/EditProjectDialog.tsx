import { useEffect, useState } from "react"
import { toast } from "sonner"
import axios from "axios"
import type { Project } from "@/net/http/types"
import { useUpdateProject } from "@/net/query"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface EditProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project | null
}

export function EditProjectDialog({
  open,
  onOpenChange,
  project,
}: EditProjectDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const updateMutation = useUpdateProject(project?.slug ?? "")

  useEffect(() => {
    if (open && project) {
      setName(project.name)
      setDescription(project.description ?? "")
    }
  }, [open, project])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!project) return
    const trimmedName = name.trim()
    if (!trimmedName) return

    const payload: { name?: string; description?: string | null } = {}
    if (trimmedName !== project.name) payload.name = trimmedName
    const nextDesc = description.trim() || null
    if (nextDesc !== (project.description ?? null))
      payload.description = nextDesc

    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }

    updateMutation.mutate(payload, {
      onSuccess: (updated) => {
        toast.success(`Project "${updated.name}" updated`)
        onOpenChange(false)
      },
      onError: (err) => {
        const detail =
          axios.isAxiosError(err) &&
          typeof err.response?.data?.detail === "string"
            ? err.response.data.detail
            : "Failed to update project"
        toast.error(detail)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update the project name or description. Slugs are stable once a
            project is created.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-project-name">Name</Label>
            <Input
              id="edit-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-project-description">Description</Label>
            <Textarea
              id="edit-project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-20"
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              disabled={updateMutation.isPending || !name.trim()}
            >
              {updateMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
