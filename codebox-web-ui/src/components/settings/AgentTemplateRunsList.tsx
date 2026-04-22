import type { AgentTemplateRun } from "@/net/http/types"
import { useAgentTemplateRuns } from "@/net/query"
import { Badge } from "@/components/ui/badge"

function statusVariant(
  status: AgentTemplateRun["status"]
): "default" | "secondary" | "destructive" {
  switch (status) {
    case "spawned":
      return "default"
    case "skipped_filter":
      return "secondary"
    case "error":
      return "destructive"
    default:
      return "secondary"
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

interface Props {
  projectSlug: string
  templateId: string
}

export function AgentTemplateRunsList({ projectSlug, templateId }: Props) {
  const { data, isLoading } = useAgentTemplateRuns(projectSlug, templateId, {
    limit: 20,
  })

  const runs = data?.runs ?? []

  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
        Recent runs
      </h3>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No runs yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {runs.map((run) => (
            <li
              key={run.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Badge variant={statusVariant(run.status)} className="text-[10px]">
                  {run.status}
                </Badge>
                <span className="truncate text-xs text-muted-foreground">
                  {run.trigger_kind}
                </span>
                {run.error && (
                  <span className="truncate text-xs text-destructive">
                    {run.error}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatDate(run.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
