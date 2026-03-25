import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { TaskForm } from "./TaskForm"

export function NewTaskDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>
            Describe what the agent should build or do.
          </DialogDescription>
        </DialogHeader>
        <TaskForm compact onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
