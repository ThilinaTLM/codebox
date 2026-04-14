import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { isToday, isYesterday } from "date-fns"
import { Square, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { Box } from "@/net/http/types"
import { useDeleteBox, useStopBox } from "@/net/query"
import { Button } from "@/components/ui/button"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import {
  getRelativeTime,
  getStatusDotClass,
  getStatusText,
  isBoxActive,
} from "@/lib/box-utils"
import { StatusDot } from "@/components/ui/status-dot"

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
// Sub-components
// ---------------------------------------------------------------------------

function StopButton({ box }: { box: Box }) {
  const [open, setOpen] = useState(false)
  const stopMutation = useStopBox()

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
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Stop Agent"
        description="This will interrupt the running process and stop the agent. You can restart it later."
        confirmLabel="Stop"
        isPending={stopMutation.isPending}
        onConfirm={() => {
          stopMutation.mutate(box.id, {
            onSuccess: () => toast.success("Agent stopped"),
            onError: () => toast.error("Failed to stop agent"),
            onSettled: () => setOpen(false),
          })
        }}
      />
    </>
  )
}

function DeleteButton({ box }: { box: Box }) {
  const [open, setOpen] = useState(false)
  const deleteMutation = useDeleteBox()

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
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Agent"
        description="This will permanently delete the agent and its container. This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          deleteMutation.mutate(box.id, {
            onSuccess: () => toast.success("Agent deleted"),
            onError: () => toast.error("Failed to delete agent"),
            onSettled: () => setOpen(false),
          })
        }}
      />
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
      <StatusDot
        color={getStatusDotClass(box)}
        animate={active}
        className="mt-1.5"
      />

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
        {active && <StopButton box={box} />}
        <DeleteButton box={box} />
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
}

export function AgentTable({ boxes }: AgentTableProps) {
  const groups = groupBoxes(boxes)

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
