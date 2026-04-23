import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { BoxStatusBadge } from "./BoxStatusBadge"
import type { AgentActivity } from "@/hooks/useAgentActivity"
import type { Box } from "@/net/http/types"
import { Button } from "@/components/ui/button"

interface BoxDetailHeaderProps {
  box: Box
  projectSlug: string
  activity: AgentActivity
  elapsed: string | null
  tabs: React.ReactNode
}

export function BoxDetailHeader({
  box,
  projectSlug,
  activity,
  elapsed,
  tabs,
}: BoxDetailHeaderProps) {
  return (
    <div className="flex items-center gap-4 border-b border-border/40 px-2">
      {/* Left: back + trimmed name */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-xs"
          nativeButton={false}
          render={
            <Link
              to="/projects/$projectSlug"
              params={{ projectSlug }}
            />
          }
          className="shrink-0 text-muted-foreground"
        >
          <ArrowLeft size={16} />
        </Button>
        <span
          className="min-w-0 truncate font-display text-sm font-medium"
          title={box.name || "Agent"}
        >
          {box.name || "Agent"}
        </span>
      </div>

      {/* Right: status + elapsed + nav tabs (all flush-right) */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-1.5">
          <BoxStatusBadge
            containerStatus={box.container_status}
            boxActivity={box.activity ?? undefined}
            boxOutcome={box.box_outcome}
            activity={activity}
          />
          {elapsed && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              · {elapsed}
            </span>
          )}
        </div>
        <nav className="flex items-center gap-0.5">{tabs}</nav>
      </div>
    </div>
  )
}
