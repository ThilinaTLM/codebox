import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { Github01Icon } from "@hugeicons/core-free-icons"
import { Square, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { Box } from "@/net/http/types"
import { Activity, ContainerStatus, TaskOutcome } from "@/net/http/types"
import { useDeleteBox, useStopBox } from "@/net/query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

interface AgentTableProps {
  boxes: Array<Box>
  variant: "active" | "recent"
}

function getStatusDotClass(box: Box): string {
  if (box.container_status === ContainerStatus.RUNNING) {
    if (
      box.activity === Activity.AGENT_WORKING ||
      box.activity === Activity.EXEC_SHELL
    ) {
      return "bg-state-writing"
    }
    return "bg-state-idle"
  }
  if (box.container_status === ContainerStatus.STARTING) {
    return "bg-state-starting"
  }
  // stopped
  if (box.task_outcome === TaskOutcome.COMPLETED) {
    return "bg-state-completed"
  }
  if (box.task_outcome === TaskOutcome.UNABLE_TO_PROCEED) {
    return "bg-state-error"
  }
  return "bg-state-idle"
}

function getRowBorderClass(box: Box): string {
  if (box.container_status === ContainerStatus.RUNNING) {
    if (
      box.activity === Activity.AGENT_WORKING ||
      box.activity === Activity.EXEC_SHELL
    ) {
      return "border-l-state-writing"
    }
    return "border-l-state-idle"
  }
  if (box.container_status === ContainerStatus.STARTING) {
    return "border-l-state-starting"
  }
  if (box.task_outcome === TaskOutcome.COMPLETED) {
    return "border-l-state-completed"
  }
  if (box.task_outcome === TaskOutcome.UNABLE_TO_PROCEED) {
    return "border-l-state-error"
  }
  return "border-l-state-idle"
}

function getTimestamp(box: Box, variant: "active" | "recent"): string {
  const ts =
    variant === "active"
      ? (box.started_at ?? box.created_at)
      : (box.created_at ?? box.started_at)
  if (!ts) return ""
  return formatDistanceToNow(new Date(ts), { addSuffix: true })
}

function isActive(box: Box): boolean {
  return (
    box.container_status === ContainerStatus.STARTING ||
    box.container_status === ContainerStatus.RUNNING
  )
}

export function AgentTable({ boxes, variant }: AgentTableProps) {
  const navigate = useNavigate()

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border/30">
          <th className="font-terminal w-8 px-3 py-2 text-left text-xs font-normal tracking-wider text-ghost uppercase" />
          <th className="font-terminal px-3 py-2 text-left text-xs font-normal tracking-wider text-ghost uppercase">
            Name
          </th>
          <th className="font-terminal hidden px-3 py-2 text-left text-xs font-normal tracking-wider text-ghost uppercase md:table-cell">
            Status
          </th>
          <th className="font-terminal hidden px-3 py-2 text-left text-xs font-normal tracking-wider text-ghost uppercase lg:table-cell">
            Model
          </th>
          <th className="font-terminal hidden px-3 py-2 text-left text-xs font-normal tracking-wider text-ghost uppercase sm:table-cell">
            Trigger
          </th>
          <th className="font-terminal px-3 py-2 text-right text-xs font-normal tracking-wider text-ghost uppercase">
            Time
          </th>
          <th className="font-terminal w-20 px-3 py-2 text-right text-xs font-normal tracking-wider text-ghost uppercase" />
        </tr>
      </thead>
      <tbody>
        {boxes.map((box) => (
          <AgentRow
            key={box.id}
            box={box}
            variant={variant}
            onNavigate={() =>
              navigate({ to: "/boxes/$boxId", params: { boxId: box.id } })
            }
          />
        ))}
      </tbody>
    </table>
  )
}

function AgentRow({
  box,
  variant,
  onNavigate,
}: {
  box: Box
  variant: "active" | "recent"
  onNavigate: () => void
}) {
  const stopMutation = useStopBox()
  const deleteMutation = useDeleteBox()
  const [showStopDialog, setShowStopDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const active = isActive(box)
  const dotClass = getStatusDotClass(box)

  const handleStop = () => {
    stopMutation.mutate(box.id, {
      onSuccess: () => toast.success("Agent stopped"),
      onError: () => toast.error("Failed to stop agent"),
    })
    setShowStopDialog(false)
  }

  const handleDelete = () => {
    deleteMutation.mutate(box.id, {
      onSuccess: () => toast.success("Agent deleted"),
      onError: () => toast.error("Failed to delete agent"),
    })
    setShowDeleteDialog(false)
  }

  const triggerLabel =
    box.trigger === "github_issue"
      ? `Issue #${box.github_issue_number ?? ""}`
      : box.trigger === "github_pr"
        ? `PR #${box.github_issue_number ?? ""}`
        : null

  const preview = box.task_outcome_message ?? ""

  return (
    <>
      <tr
        onClick={onNavigate}
        className={cn(
          "group cursor-pointer border-b border-border/30 transition-colors hover:bg-accent/30",
          variant === "active" && "border-l-2",
          variant === "active" && getRowBorderClass(box)
        )}
      >
        {/* Status dot */}
        <td className="px-3 py-2.5">
          <div className="relative flex items-center justify-center">
            <div className={cn("size-2 rounded-full", dotClass)} />
            {active && (
              <div
                className={cn(
                  "animate-status-ping absolute size-2 rounded-full",
                  dotClass
                )}
              />
            )}
          </div>
        </td>

        {/* Name + preview */}
        <td className="max-w-xs px-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate font-display font-medium">{box.name}</div>
            {preview && (
              <div className="truncate text-sm text-muted-foreground">
                {preview}
              </div>
            )}
          </div>
        </td>

        {/* Status text */}
        <td className="hidden px-3 py-2.5 md:table-cell">
          <StatusLabel box={box} />
        </td>

        {/* Model */}
        <td className="hidden px-3 py-2.5 lg:table-cell">
          <Badge
            variant="outline"
            className="font-terminal text-xs text-muted-foreground"
          >
            {box.model}
          </Badge>
        </td>

        {/* Trigger */}
        <td className="hidden px-3 py-2.5 sm:table-cell">
          {triggerLabel ? (
            <Badge variant="outline" className="gap-1 py-0 text-xs">
              <HugeiconsIcon icon={Github01Icon} size={12} />
              {triggerLabel}
            </Badge>
          ) : (
            <span className="text-xs text-ghost">Manual</span>
          )}
        </td>

        {/* Time */}
        <td className="px-3 py-2.5 text-right">
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {getTimestamp(box, variant)}
          </span>
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5 text-right">
          <div
            className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {active && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:text-warning text-muted-foreground"
                onClick={() => setShowStopDialog(true)}
              >
                <Square size={15} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </td>
      </tr>

      {/* Stop confirmation dialog */}
      <AlertDialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Agent</AlertDialogTitle>
            <AlertDialogDescription>
              This will interrupt the running process and stop the agent. You
              can restart it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStop}
              disabled={stopMutation.isPending}
            >
              Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the agent and its container. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function StatusLabel({ box }: { box: Box }) {
  if (box.container_status === ContainerStatus.STARTING) {
    return <span className="text-xs text-state-starting">Starting</span>
  }
  if (box.container_status === ContainerStatus.RUNNING) {
    if (box.activity === Activity.AGENT_WORKING) {
      return <span className="text-xs text-state-writing">Working</span>
    }
    if (box.activity === Activity.EXEC_SHELL) {
      return <span className="text-xs text-state-writing">Running command</span>
    }
    return <span className="text-xs text-state-idle">Idle</span>
  }
  if (box.task_outcome === TaskOutcome.COMPLETED) {
    return <span className="text-xs text-state-completed">Completed</span>
  }
  if (box.task_outcome === TaskOutcome.UNABLE_TO_PROCEED) {
    return <span className="text-xs text-state-error">Error</span>
  }
  return <span className="text-xs text-state-idle">Stopped</span>
}
