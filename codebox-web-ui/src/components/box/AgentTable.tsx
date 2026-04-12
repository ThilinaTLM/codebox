import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { formatDistanceToNow, isToday, isYesterday } from "date-fns"
import { Square, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import type { Box } from "@/net/http/types"
import { Activity, ContainerStatus, TaskOutcome } from "@/net/http/types"
import { useDeleteBox, useStopBox } from "@/net/query"
import { Button } from "@/components/ui/button"
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBoxActive(box: Box): boolean {
  return (
    box.container_status === ContainerStatus.STARTING ||
    box.container_status === ContainerStatus.RUNNING
  )
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
  if (box.task_outcome === TaskOutcome.COMPLETED) {
    return "bg-state-completed"
  }
  if (box.task_outcome === TaskOutcome.UNABLE_TO_PROCEED) {
    return "bg-state-error"
  }
  return "bg-state-idle"
}

function getStatusText(box: Box): string {
  if (box.container_status === ContainerStatus.STARTING) return "Starting…"
  if (box.container_status === ContainerStatus.RUNNING) {
    if (box.activity === Activity.AGENT_WORKING) return "Working…"
    if (box.activity === Activity.EXEC_SHELL) return "Running command…"
    return "Idle"
  }
  if (box.task_outcome_message) return box.task_outcome_message
  if (box.task_outcome === TaskOutcome.COMPLETED) return "Completed"
  if (box.task_outcome === TaskOutcome.NEED_CLARIFICATION)
    return "Needs clarification"
  if (box.task_outcome === TaskOutcome.UNABLE_TO_PROCEED)
    return "Unable to proceed"
  if (box.error_detail) return "Error"
  return "Stopped"
}

function getRelativeTime(box: Box): string {
  const ts = box.started_at ?? box.created_at
  if (!ts) return ""
  return formatDistanceToNow(new Date(ts), { addSuffix: true })
}

type GroupKey = "active" | "today" | "yesterday" | "older"

function groupBoxes(
  boxes: Array<Box>
): Array<{ key: GroupKey; title: string; boxes: Array<Box> }> {
  const groups: Record<GroupKey, Array<Box>> = {
    active: [],
    today: [],
    yesterday: [],
    older: [],
  }

  for (const box of boxes) {
    if (isBoxActive(box)) {
      groups.active.push(box)
    } else {
      const ts = box.created_at ? new Date(box.created_at) : null
      if (ts && isToday(ts)) {
        groups.today.push(box)
      } else if (ts && isYesterday(ts)) {
        groups.yesterday.push(box)
      } else {
        groups.older.push(box)
      }
    }
  }

  const labels: Record<GroupKey, string> = {
    active: "Active",
    today: "Today",
    yesterday: "Yesterday",
    older: "Older",
  }

  return (
    (["active", "today", "yesterday", "older"] as Array<GroupKey>)
  )
    .filter((k) => groups[k].length > 0)
    .map((k) => ({ key: k, title: labels[k], boxes: groups[k] }))
}

// ---------------------------------------------------------------------------
// TanStack Table setup (used for future sorting/filtering)
// ---------------------------------------------------------------------------

const columnHelper = createColumnHelper<Box>()

const columns = [
  columnHelper.display({ id: "row", cell: () => null }),
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({
  box,
  className,
}: {
  box: Box
  className?: string
}) {
  const active = isBoxActive(box)
  const dotClass = getStatusDotClass(box)
  return (
    <div className={cn("relative flex items-center justify-center", className)}>
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
  )
}

function StopButton({
  box,
  onConfirm,
}: {
  box: Box
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  const stopMutation = useStopBox()

  const handleStop = () => {
    stopMutation.mutate(box.id, {
      onSuccess: () => toast.success("Agent stopped"),
      onError: () => toast.error("Failed to stop agent"),
    })
    setOpen(false)
    onConfirm()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-warning"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <Square size={15} />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
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
    </>
  )
}

function DeleteButton({
  box,
  onConfirm,
}: {
  box: Box
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  const deleteMutation = useDeleteBox()

  const handleDelete = () => {
    deleteMutation.mutate(box.id, {
      onSuccess: () => toast.success("Agent deleted"),
      onError: () => toast.error("Failed to delete agent"),
    })
    setOpen(false)
    onConfirm()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <Trash2 size={15} />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
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

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function AgentRow({ box }: { box: Box }) {
  const active = isBoxActive(box)

  return (
    <Link
      to="/boxes/$boxId"
      params={{ boxId: box.id }}
      className="group flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border/40 hover:bg-muted/30"
    >
      {/* Status dot */}
      <StatusDot box={box} className="mt-1.5" />

      <div className="min-w-0 flex-1">
        {/* Line 1: Name + Tags + Time */}
        <div className="flex items-center gap-2">
          <span className="truncate font-display font-medium">
            {box.name || "Unnamed"}
          </span>
          {box.tags?.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-muted px-1.5 py-0.5 text-2xs"
            >
              {tag}
            </span>
          ))}
          <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
            {getRelativeTime(box)}
          </span>
        </div>

        {/* Line 2: Status text + Trigger + Model */}
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{getStatusText(box)}</span>
          {box.github_repo && (
            <>
              <span>·</span>
              <span>
                {box.github_repo}
                {box.github_issue_number
                  ? ` #${box.github_issue_number}`
                  : ""}
              </span>
            </>
          )}
          <span className="ml-auto hidden lg:inline">
            {box.provider} · {box.model}
          </span>
        </div>

        {/* Error line */}
        {box.error_detail && (
          <div
            className="mt-1 truncate text-xs text-destructive"
            title={box.error_detail}
          >
            {box.error_detail}
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-1 opacity-50 transition-opacity group-hover:opacity-100"
        onClick={(e) => e.preventDefault()}
      >
        {active && <StopButton box={box} onConfirm={() => {}} />}
        <DeleteButton box={box} onConfirm={() => {}} />
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="text-label mb-2 mt-6 flex items-center gap-2 first:mt-0">
      {title}
      <span className="rounded-full bg-muted px-2 py-0.5 text-2xs">
        {count}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AgentTableProps {
  boxes: Array<Box>
  variant?: "active" | "recent"
}

export function AgentTable({ boxes }: AgentTableProps) {
  const table = useReactTable({
    data: boxes,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const groups = groupBoxes(boxes)

  // Keep flexRender accessible for future column-based rendering
  void flexRender
  void table

  return (
    <div>
      {groups.map((group) => (
        <div key={group.key}>
          <SectionHeader title={group.title} count={group.boxes.length} />
          <div className="flex flex-col gap-0.5">
            {group.boxes.map((box) => (
              <AgentRow key={box.id} box={box} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
