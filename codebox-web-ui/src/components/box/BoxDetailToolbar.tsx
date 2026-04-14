import { useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  Copy,
  Ellipsis,
  FileText,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { BoxStatusBadge } from "./BoxStatusBadge"
import type { AgentActivity } from "@/hooks/useAgentActivity"
import type { Box } from "@/net/http/types"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface BoxDetailToolbarProps {
  box: Box
  activity: AgentActivity
  elapsed: string | null
  isActive: boolean
  isStopped: boolean
  onStop: () => void
  onRestart: () => void
  onDelete: () => void
  isStopPending: boolean
  isRestartPending: boolean
  isDeletePending: boolean
}

export function BoxDetailToolbar({
  box,
  activity,
  elapsed,
  isActive,
  isStopped,
  onStop,
  onRestart,
  onDelete,
  isStopPending,
  isRestartPending,
  isDeletePending,
}: BoxDetailToolbarProps) {
  const [confirmStop, setConfirmStop] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleCopyId = () => {
    navigator.clipboard.writeText(box.id)
    toast.success("Copied agent ID")
  }

  return (
    <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon-xs"
          nativeButton={false}
          render={<Link to="/" />}
          className="shrink-0 text-muted-foreground"
        >
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-sm font-medium">
              {box.name || "Agent"}
            </span>
            <BoxStatusBadge
              containerStatus={box.container_status}
              boxActivity={box.activity ?? undefined}
              taskOutcome={box.task_outcome}
              activity={activity}
            />
            {elapsed && (
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                · {elapsed}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isStopped && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRestart}
            disabled={isRestartPending}
            className="gap-1.5 text-xs"
          >
            <RotateCw
              size={12}
              className={isRestartPending ? "animate-spin" : ""}
            />
            {isRestartPending ? "Restarting" : "Restart"}
          </Button>
        )}
        {isActive && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={isStopPending}
              className="gap-1.5 text-xs"
              onClick={() => setConfirmStop(true)}
            >
              <Square size={10} fill="currentColor" />
              Stop
            </Button>
            <ConfirmActionDialog
              open={confirmStop}
              onOpenChange={setConfirmStop}
              title="Stop agent?"
              description="This will stop the running agent container. You can restart it later."
              confirmLabel="Stop"
              isPending={isStopPending}
              onConfirm={() => {
                onStop()
                setConfirmStop(false)
              }}
            />
          </>
        )}
        {/* Overflow menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
              />
            }
          >
            <Ellipsis size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={handleCopyId}>
              <Copy size={14} />
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  to="/boxes/$boxId/logs"
                  params={{ boxId: box.id }}
                />
              }
            >
              <FileText size={14} />
              Container Logs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ConfirmActionDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete agent?"
          description="This will permanently delete the agent and its container. This action cannot be undone."
          confirmLabel="Delete"
          confirmVariant="destructive"
          isPending={isDeletePending}
          onConfirm={() => {
            onDelete()
          }}
        />
      </div>
    </div>
  )
}
