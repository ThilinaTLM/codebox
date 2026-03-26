import { useState } from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Github01Icon } from "@hugeicons/core-free-icons"
import { Plus, Square, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import type { Box } from "@/net/http/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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
import { BoxStatusBadge } from "@/components/box/BoxStatusBadge"
import { useBoxes, useCreateBox, useDeleteBox, useStopBox } from "@/net/query"
import { BoxStatus } from "@/net/http/types"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({ component: HomePage })

const ACTIVE_STATUSES = [BoxStatus.STARTING, BoxStatus.RUNNING, BoxStatus.IDLE]

function HomePage() {
  const { data: boxes, isLoading } = useBoxes()
  const createMutation = useCreateBox()
  const navigate = useNavigate()

  const activeBoxes = (boxes ?? []).filter((b) =>
    ACTIVE_STATUSES.includes(b.status)
  )
  const recentBoxes = (boxes ?? []).filter(
    (b) => !ACTIVE_STATUSES.includes(b.status)
  )

  const handleCreate = () => {
    createMutation.mutate(
      {},
      {
        onSuccess: (box) => {
          toast.success("Agent created")
          navigate({ to: "/boxes/$boxId", params: { boxId: box.id } })
        },
        onError: () => toast.error("Failed to create agent"),
      }
    )
  }

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-y-auto">
      {/* Page header */}
      <div className="bg-hero-gradient px-6 pt-10 pb-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-bold tracking-tight">
                Agents
              </h1>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                Your running and recent coding agents.
              </p>
            </div>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="gap-1.5"
            >
              <Plus size={16} />
              New Agent
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl">
          {isLoading ? (
            <div className="pt-8">
              <Skeleton className="mb-4 h-3 w-16 rounded" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-2xl" />
                ))}
              </div>
            </div>
          ) : boxes && boxes.length > 0 ? (
            <>
              {/* Active agents */}
              {activeBoxes.length > 0 && (
                <section className="pt-8">
                  <h2 className="font-display mb-4 max-w-xs text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                    Active
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {activeBoxes.map((box, i) => (
                      <AgentCard
                        key={box.id}
                        box={box}
                        style={{ animationDelay: `${i * 60}ms` }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Recent agents */}
              {recentBoxes.length > 0 && (
                <section className="pt-8">
                  <h2 className="font-display mb-4 max-w-xs text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                    Recent
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {recentBoxes.map((box, i) => (
                      <AgentCard
                        key={box.id}
                        box={box}
                        style={{ animationDelay: `${i * 60}ms` }}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="rounded-2xl border border-dashed border-muted-foreground/20 p-12">
                <h2 className="font-display text-lg font-semibold">
                  No agents yet
                </h2>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Create your first agent to start coding.
                </p>
                <Button
                  className="mt-6 gap-1.5"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  <Plus size={16} />
                  New Agent
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getCardTimestamp(box: Box): string {
  const ts = ACTIVE_STATUSES.includes(box.status)
    ? (box.started_at ?? box.created_at)
    : (box.completed_at ?? box.created_at)
  return formatDistanceToNow(new Date(ts), { addSuffix: true })
}

function AgentCard({ box, style }: { box: Box; style?: React.CSSProperties }) {
  const isActive = ACTIVE_STATUSES.includes(box.status)
  const stopMutation = useStopBox()
  const deleteMutation = useDeleteBox()
  const [showStopDialog, setShowStopDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

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

  return (
    <>
      <Link
        to="/boxes/$boxId"
        params={{ boxId: box.id }}
        className="group/card block"
      >
        <Card
          className={cn(
            "card-glow animate-fade-up cursor-pointer border-0 bg-primary/[0.04] ring-1 ring-primary/20 transition-colors hover:bg-primary/[0.07]",
            isActive &&
              "bg-primary/[0.07] ring-primary/35 hover:bg-primary/[0.1]"
          )}
          style={style}
        >
          <CardContent className="space-y-2.5 px-4 py-3">
            {/* Top row: name + actions */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <h3 className="font-display truncate font-semibold">
                  {box.name}
                </h3>
                {box.container_name && (
                  <p className="truncate font-mono text-xs text-muted-foreground/50">
                    {box.container_name}
                  </p>
                )}
              </div>
              <div
                className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100"
                onClick={(e) => e.preventDefault()}
              >
                {isActive && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-warning"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowStopDialog(true)
                    }}
                  >
                    <Square size={15} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDeleteDialog(true)
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>

            {/* Prompt preview or result/error summary */}
            {box.status === BoxStatus.FAILED && box.error_message ? (
              <p className="line-clamp-2 text-[13px] leading-relaxed text-destructive/80">
                {box.error_message}
              </p>
            ) : box.status === BoxStatus.COMPLETED && box.result_summary ? (
              <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground/70">
                {box.result_summary}
              </p>
            ) : box.initial_prompt ? (
              <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground/70">
                {box.initial_prompt}
              </p>
            ) : null}

            {/* Bottom meta */}
            <div className="space-y-1 pt-0.5">
              <div className="flex items-center gap-2">
                <BoxStatusBadge status={box.status} />
                <span className="font-mono text-xs text-muted-foreground">
                  {box.model}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                {triggerLabel && box.github_repo ? (
                  <Badge variant="outline" className="gap-1 py-0 text-[11px]">
                    <HugeiconsIcon icon={Github01Icon} size={12} />
                    {triggerLabel}
                  </Badge>
                ) : box.github_repo ? (
                  <Badge variant="outline" className="gap-1 py-0 text-[11px]">
                    <HugeiconsIcon icon={Github01Icon} size={12} />
                    {box.github_repo.split("/").pop()}
                  </Badge>
                ) : (
                  <Badge
                    variant="ghost"
                    className="py-0 text-[11px] text-muted-foreground/40"
                  >
                    Manual
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground/50">
                  {getCardTimestamp(box)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

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
