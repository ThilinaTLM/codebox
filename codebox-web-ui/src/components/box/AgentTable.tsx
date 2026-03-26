import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { Github01Icon } from "@hugeicons/core-free-icons"
import { Square, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { Box } from "@/net/http/types"
import { AgentReportStatus, ContainerStatus, TaskStatus } from "@/net/http/types"
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
    if (box.task_status === TaskStatus.AGENT_WORKING || box.task_status === TaskStatus.EXEC_SHELL) {
      return "bg-state-writing"
    }
    return "bg-state-idle"
  }
  if (box.container_status === ContainerStatus.STARTING) {
    return "bg-state-starting"
  }
  // stopped
  if (box.agent_report_status === AgentReportStatus.COMPLETED) {
    return "bg-state-completed"
  }
  if (
    box.stop_reason === "container_error" ||
    box.agent_report_status === AgentReportStatus.UNABLE_TO_PROCEED
  ) {
    return "bg-state-error"
  }
  return "bg-state-idle"
}

function getRowBorderClass(box: Box): string {
  if (box.container_status === ContainerStatus.RUNNING) {
    if (box.task_status === TaskStatus.AGENT_WORKING || box.task_status === TaskStatus.EXEC_SHELL) {
      return "border-l-state-writing"
    }
    return "border-l-state-idle"
  }
  if (box.container_status === ContainerStatus.STARTING) {
    return "border-l-state-starting"
  }
  if (box.agent_report_status === AgentReportStatus.COMPLETED) {
    return "border-l-state-completed"
  }
  if (
    box.stop_reason === "container_error" ||
    box.agent_report_status === AgentReportStatus.UNABLE_TO_PROCEED
  ) {
    return "border-l-state-error"
  }
  return "border-l-state-idle"
}

function getTimestamp(box: Box, variant: "active" | "recent"): string {
  const ts =
    variant === "active"
      ? (box.started_at ?? box.created_at)
      : (box.completed_at ?? box.created_at)
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
          <th className="w-8 px-3 py-2 text-left text-xs text-ghost uppercase tracking-wider font-terminal font-normal" />
          <th className="px-3 py-2 text-left text-xs text-ghost uppercase tracking-wider font-terminal font-normal">
            Name
          </th>
          <th className="hidden px-3 py-2 text-left text-xs text-ghost uppercase tracking-wider font-terminal font-normal md:table-cell">
            Status
          </th>
          <th className="hidden px-3 py-2 text-left text-xs text-ghost uppercase tracking-wider font-terminal font-normal lg:table-cell">
            Model
          </th>
          <th className="hidden px-3 py-2 text-left text-xs text-ghost uppercase tracking-wider font-terminal font-normal sm:table-cell">
            Trigger
          </th>
          <th className="px-3 py-2 text-right text-xs text-ghost uppercase tracking-wider font-terminal font-normal">
            Time
          </th>
          <th className="w-20 px-3 py-2 text-right text-xs text-ghost uppercase tracking-wider font-terminal font-normal" />
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
        ? `PR #${box.github_pr_number ?? ""}`
        : null

  const preview = box.agent_report_message ?? box.initial_prompt ?? ""

  return (
    <>
      <tr
        onClick={onNavigate}
        className={cn(
          "group border-b border-border/30 hover:bg-accent/30 cursor-pointer transition-colors",
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
                  "absolute size-2 rounded-full animate-status-ping",
                  dotClass
                )}
              />
            )}
          </div>
        </td>

        {/* Name + preview */}
        <td className="max-w-xs px-3 py-2.5">
          <div className="min-w-0">
            <div className="font-display font-medium truncate">{box.name}</div>
            {preview && (
              <div className="text-muted-foreground text-sm truncate">
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
          <Badge variant="outline" className="font-terminal text-xs text-muted-foreground">
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
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {getTimestamp(box, variant)}
          </span>
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5 text-right">
          <div
            className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            {active && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-warning"
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
              This will interrupt the running process and stop the agent. You can
              restart it later.
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
    if (box.task_status === TaskStatus.AGENT_WORKING) {
      return <span className="text-xs text-state-writing">Working</span>
    }
    if (box.task_status === TaskStatus.EXEC_SHELL) {
      return <span className="text-xs text-state-writing">Running command</span>
    }
    return <span className="text-xs text-state-idle">Idle</span>
  }
  if (box.agent_report_status === AgentReportStatus.COMPLETED) {
    return <span className="text-xs text-state-completed">Completed</span>
  }
  if (box.stop_reason === "container_error") {
    return <span className="text-xs text-state-error">Error</span>
  }
  return <span className="text-xs text-state-idle">Stopped</span>
}
