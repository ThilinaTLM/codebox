import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { BoxStatusBadge } from "./BoxStatusBadge"
import type { AgentActivity } from "@/hooks/useAgentActivity"
import type { Box } from "@/net/http/types"
import { Button } from "@/components/ui/button"

interface BoxDetailHeaderProps {
  box: Box
  activity: AgentActivity
  elapsed: string | null
  tabs: React.ReactNode
}

export function BoxDetailHeader({
  box,
  activity,
  elapsed,
  tabs,
}: BoxDetailHeaderProps) {
  return (
    <div className="flex items-center border-b border-border/40 px-2">
      <div className="flex shrink-0 items-center gap-2 pr-4">
        <Button
          variant="ghost"
          size="icon-xs"
          nativeButton={false}
          render={<Link to="/" />}
          className="shrink-0 text-muted-foreground"
        >
          <ArrowLeft size={16} />
        </Button>
        <span className="truncate font-display text-sm font-medium">
          {box.name || "Agent"}
        </span>
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

      <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
        {tabs}
      </nav>
    </div>
  )
}
