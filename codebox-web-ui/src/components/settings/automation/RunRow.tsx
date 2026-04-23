import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertCircleIcon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  MinusSignCircleIcon,
} from "@hugeicons/core-free-icons"
import type { AutomationRun } from "@/net/http/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function statusMeta(status: AutomationRun["status"]): {
  label: string
  variant: "default" | "secondary" | "destructive"
  icon: typeof CheckmarkCircle02Icon
} {
  switch (status) {
    case "spawned":
      return {
        label: "Spawned",
        variant: "default",
        icon: CheckmarkCircle02Icon,
      }
    case "skipped_filter":
      return {
        label: "Skipped",
        variant: "secondary",
        icon: MinusSignCircleIcon,
      }
    case "error":
      return {
        label: "Error",
        variant: "destructive",
        icon: AlertCircleIcon,
      }
  }
}

interface RunRowProps {
  run: AutomationRun
  projectSlug: string
}

export function RunRow({ run, projectSlug }: RunRowProps) {
  const [expanded, setExpanded] = useState(false)
  const meta = statusMeta(run.status)
  const relative = (() => {
    try {
      return formatDistanceToNow(new Date(run.created_at), { addSuffix: true })
    } catch {
      return run.created_at
    }
  })()

  const canExpand = !!run.error

  return (
    <li className="rounded-xl border border-border/50 bg-card/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Badge variant={meta.variant} className="gap-1">
          <HugeiconsIcon icon={meta.icon} strokeWidth={2} className="size-3" />
          {meta.label}
        </Badge>
        <span className="truncate text-xs text-muted-foreground">
          {run.trigger_kind}
          {run.matched_action && (
            <span className="text-muted-foreground/70">
              {" · "}
              {run.matched_action}
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {relative}
                </span>
              }
            />
            <TooltipContent>
              {new Date(run.created_at).toLocaleString()}
            </TooltipContent>
          </Tooltip>
          {run.box_id && (
            <Button
              size="xs"
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  to="/projects/$projectSlug/boxes/$boxId"
                  params={{ projectSlug, boxId: run.box_id }}
                />
              }
            >
              View Box
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                data-icon="inline-end"
              />
            </Button>
          )}
          {canExpand && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Hide" : "Details"}
            </Button>
          )}
        </div>
      </div>
      {canExpand && expanded && (
        <div className="border-t border-border/50 bg-destructive/5 px-4 py-3">
          <p className="font-mono text-[11px] text-destructive">{run.error}</p>
        </div>
      )}
    </li>
  )
}
