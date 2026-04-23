import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Refresh01Icon } from "@hugeicons/core-free-icons"
import { RunRow } from "./RunRow"
import { useInfiniteAutomationRuns } from "@/net/query"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type StatusFilter = "all" | "spawned" | "skipped_filter" | "error"

const STATUS_FILTERS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "spawned", label: "Spawned" },
  { id: "skipped_filter", label: "Skipped" },
  { id: "error", label: "Errored" },
]

interface AutomationRunsPanelProps {
  projectSlug: string
  automationId: string
}

export function AutomationRunsPanel({
  projectSlug,
  automationId,
}: AutomationRunsPanelProps) {
  return (
    <RunsPanelInner
      projectSlug={projectSlug}
      automationId={automationId}
      initialStatus="all"
    />
  )
}

function RunsPanelInner({
  projectSlug,
  automationId,
  initialStatus,
}: {
  projectSlug: string
  automationId: string
  initialStatus: StatusFilter
}) {
  // Keep the filter state in the URL? For v1, local state.
  const [status, setStatus] = useStatusState(initialStatus)

  const query = useInfiniteAutomationRuns(projectSlug, automationId, {
    status: status === "all" ? null : status,
    limit: 20,
  })

  const runs = query.data?.pages.flatMap((p) => p.runs) ?? []
  const isLoading = query.isLoading
  const isEmpty = !isLoading && runs.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base">Runs</h3>
          <p className="text-xs text-muted-foreground">
            Recent triggers for this automation.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          aria-label="Refresh runs"
        >
          <HugeiconsIcon
            icon={Refresh01Icon}
            strokeWidth={2}
            className={cn(
              "size-4",
              query.isFetching && "animate-spin"
            )}
          />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.id
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setStatus(f.id)}
              data-active={active ? "true" : undefined}
              className={cn(
                "inline-flex items-center rounded-full border border-border/50 bg-background px-3 py-1 text-xs transition-colors",
                "hover:bg-muted",
                "data-[active=true]:border-primary/60 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
              )}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : isEmpty ? (
        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          {status === "all"
            ? "No runs yet. Use Dry run to preview matches without creating a box."
            : "No runs with this status."}
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} projectSlug={projectSlug} />
            ))}
          </ul>
          {query.hasNextPage && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function useStatusState(initial: StatusFilter) {
  return useState<StatusFilter>(initial)
}
