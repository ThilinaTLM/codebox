import { useEffect, useState } from "react"
import { toast } from "sonner"
import axios from "axios"
import { ProjectMemberSearchCombobox } from "./ProjectMemberSearchCombobox"
import type { ProjectMemberCandidate } from "@/net/http/types"
import { useAddProjectMember } from "@/net/query"
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
import { Label } from "@/components/ui/label"

interface AddProjectMemberDialogProps {
  projectSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddProjectMemberDialog({
  projectSlug,
  open,
  onOpenChange,
}: AddProjectMemberDialogProps) {
  const [selected, setSelected] = useState<ProjectMemberCandidate | null>(null)
  const [role, setRole] = useState<"admin" | "contributor">("contributor")
  const addMutation = useAddProjectMember(projectSlug)

  useEffect(() => {
    if (open) {
      setSelected(null)
      setRole("contributor")
    }
  }, [open])

  const handleSubmit = () => {
    if (!selected) return
    addMutation.mutate(
      { userId: selected.id, role },
      {
        onSuccess: () => {
          toast.success(`Added ${selected.username} to the project`)
          onOpenChange(false)
        },
        onError: (err) => {
          const detail =
            axios.isAxiosError(err) &&
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Failed to add member"
          toast.error(detail)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add project member</DialogTitle>
          <DialogDescription>
            Search for a user and choose their project role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>User</Label>
            <ProjectMemberSearchCombobox
              projectSlug={projectSlug}
              value={selected}
              onChange={setSelected}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={role === "contributor" ? "default" : "outline"}
                onClick={() => setRole("contributor")}
              >
                Contributor
              </Button>
              <Button
                type="button"
                size="sm"
                variant={role === "admin" ? "default" : "outline"}
                onClick={() => setRole("admin")}
              >
                Admin
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Admins can manage members and project settings. Contributors can
              use agents and view settings.
            </p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </DialogClose>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!selected || addMutation.isPending}
          >
            {addMutation.isPending ? "Adding..." : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
