import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import {
  Clock,
  Copy,
  GitBranch,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { useBoxDetail } from "@/components/box/BoxDetailContext"
import { TaskOutcomeBadge } from "@/components/box/BoxStatusBadge"
import { RecentActivityFeed } from "@/components/box/RecentActivityFeed"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import { Button } from "@/components/ui/button"
import { StatusDot } from "@/components/ui/status-dot"
import { STATE_DOT_COLORS, STATE_GLOW_CLASSES } from "@/lib/state-colors"
import { cn } from "@/lib/utils"
import { useBoxEvents } from "@/net/query"

export const Route = createFileRoute("/boxes/$boxId/")({
  component: BoxOverviewPage,
})

/* ── Page ────────────────────────────────────────────────────── */

function BoxOverviewPage() {
  const { box, boxId, isActive, isStopped, activity, elapsed, actions } =
    useBoxDetail()
  const { data: events } = useBoxEvents(boxId, { limit: 30 })
  const [confirmStop, setConfirmStop] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleCopyId = () => {
    navigator.clipboard.writeText(box.id)
    toast.success("Copied agent ID")
  }

  const glowClass = STATE_GLOW_CLASSES[activity.state]
  const hasGithub = !!box.github_repo

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
        {/* ── Top cards grid ───────────────────────────────── */}
        <div
          className={cn(
            "grid shrink-0 gap-4",
            hasGithub ? "grid-cols-3" : "grid-cols-2"
          )}
        >
          {/* ── Status card ──────────────────────────────── */}
          <div
            className={cn(
              "flex flex-col justify-between rounded-xl border border-border/50 bg-card px-5 py-4",
              glowClass && "glow-card",
              glowClass
            )}
          >
            {/* Top: state + elapsed */}
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <StatusDot
                    color={STATE_DOT_COLORS[activity.state]}
                    animate={activity.animate}
                    className="size-2.5"
                  />
                  <span className="font-display text-lg font-semibold">
                    {activity.label}
                  </span>
                </div>
                {elapsed && (
                  <div className="shrink-0 text-right">
                    <div className="font-display text-xl font-semibold tabular-nums">
                      {elapsed}
                    </div>
                    <div className="text-2xs text-ghost">elapsed</div>
                  </div>
                )}
              </div>

              {/* Outcome */}
              {box.task_outcome && (
                <div className="mt-3 flex items-center gap-2">
                  <TaskOutcomeBadge status={box.task_outcome} />
                  {box.task_outcome_message && (
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {box.task_outcome_message}
                    </span>
                  )}
                </div>
              )}

              {/* Description */}
              {box.description && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {box.description}
                </p>
              )}
            </div>

            {/* Bottom: actions */}
            <div className="mt-4 flex items-center gap-1.5">
              {isActive && (
                <>
                  <Button
                    variant="outline"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                    disabled={actions.isStopPending}
                    onClick={() => setConfirmStop(true)}
                  >
                    <Square
                      size={8}
                      fill="currentColor"
                      className={
                        actions.isStopPending ? "animate-pulse" : ""
                      }
                    />
                    {actions.isStopPending ? "Stopping…" : "Stop"}
                  </Button>
                  <ConfirmActionDialog
                    open={confirmStop}
                    onOpenChange={setConfirmStop}
                    title="Stop agent?"
                    description="This will stop the running agent container. You can restart it later."
                    confirmLabel="Stop"
                    isPending={actions.isStopPending}
                    onConfirm={() => {
                      actions.stop()
                      setConfirmStop(false)
                    }}
                  />
                </>
              )}
              {isStopped && (
                <Button
                  variant="outline"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={actions.isRestartPending}
                  onClick={actions.restart}
                >
                  <RotateCw
                    size={10}
                    className={
                      actions.isRestartPending ? "animate-spin" : ""
                    }
                  />
                  {actions.isRestartPending ? "Restarting…" : "Restart"}
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground"
                onClick={handleCopyId}
              >
                <Copy size={10} />
                Copy ID
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                className="h-7 gap-1.5 px-2.5 text-xs text-destructive/60 hover:text-destructive"
                disabled={actions.isDeletePending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={10} />
                {actions.isDeletePending ? "Deleting…" : "Delete"}
              </Button>
              <ConfirmActionDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete agent?"
                description="This will permanently delete the agent and its container. This action cannot be undone."
                confirmLabel="Delete"
                confirmVariant="destructive"
                isPending={actions.isDeletePending}
                onConfirm={actions.delete}
              />
            </div>
          </div>

          {/* ── Configuration card ───────────────────────── */}
          <div className="rounded-xl border border-border/50 bg-card px-5 py-4">
            <h3 className="text-label mb-3 font-medium uppercase tracking-wider">
              Configuration
            </h3>
            <dl className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-2xs uppercase tracking-wider text-ghost">
                  Model
                </dt>
                <dd className="min-w-0 truncate text-sm font-medium">
                  {box.model}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-2xs uppercase tracking-wider text-ghost">
                  Provider
                </dt>
                <dd className="text-sm text-foreground/80">
                  {box.provider}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-2xs uppercase tracking-wider text-ghost">
                  Image
                </dt>
                <dd className="min-w-0 truncate font-terminal text-xs text-foreground/60">
                  {box.image}
                </dd>
              </div>
              {box.created_at && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-2xs uppercase tracking-wider text-ghost">
                    Created
                  </dt>
                  <dd className="flex items-center gap-1.5 text-sm text-foreground/80">
                    <Clock
                      size={11}
                      className="shrink-0 text-muted-foreground"
                    />
                    {formatDistanceToNow(new Date(box.created_at), {
                      addSuffix: true,
                    })}
                  </dd>
                </div>
              )}
            </dl>

            {/* Tags (shown here when no GitHub card) */}
            {!hasGithub && box.tags && box.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border/30 pt-3">
                {box.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md border border-border/40 bg-muted/50 px-2 py-0.5 text-2xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── GitHub card (conditional) ─────────────────── */}
          {hasGithub && (
            <div className="rounded-xl border border-border/50 bg-card px-5 py-4">
              <h3 className="text-label mb-3 font-medium uppercase tracking-wider">
                GitHub
              </h3>
              <dl className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-2xs uppercase tracking-wider text-ghost">
                    Repo
                  </dt>
                  <dd className="min-w-0 truncate text-sm font-medium">
                    <a
                      href={`https://github.com/${box.github_repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                    >
                      {box.github_repo}
                    </a>
                  </dd>
                </div>
                {box.github_branch && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-2xs uppercase tracking-wider text-ghost">
                      Branch
                    </dt>
                    <dd className="flex items-center gap-1.5 font-terminal text-xs text-foreground/80">
                      <GitBranch
                        size={11}
                        className="shrink-0 text-muted-foreground"
                      />
                      {box.github_branch}
                    </dd>
                  </div>
                )}
                {box.github_issue_number != null && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-2xs uppercase tracking-wider text-ghost">
                      Issue
                    </dt>
                    <dd className="text-sm text-foreground/80">
                      <a
                        href={`https://github.com/${box.github_repo}/issues/${box.github_issue_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                      >
                        #{box.github_issue_number}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              {/* Tags */}
              {box.tags && box.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border/30 pt-3">
                  {box.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-border/40 bg-muted/50 px-2 py-0.5 text-2xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Activity feed (fills remaining height) ──────── */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/50 bg-card px-5 py-4">
          <h3 className="text-label mb-3 shrink-0 font-medium uppercase tracking-wider">
            Recent Activity
          </h3>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RecentActivityFeed events={events ?? []} />
          </div>
        </div>
      </div>
    </div>
  )
}
