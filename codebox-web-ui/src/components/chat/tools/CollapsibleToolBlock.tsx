import { useState } from "react"
import { ChevronRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface CollapsibleToolBlockProps {
  icon: LucideIcon
  iconSize?: number
  label: React.ReactNode
  summary?: string
  statusColor?: string
  children: React.ReactNode
}

export function CollapsibleToolBlock({
  icon: Icon,
  iconSize = 12,
  label,
  summary,
  statusColor = "bg-state-completed",
  children,
}: CollapsibleToolBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50">
        <ChevronRight
          size={12}
          className={`shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <span className={`size-1.5 shrink-0 rounded-full ${statusColor}`} />
        <Icon size={iconSize} className="shrink-0 text-muted-foreground" />
        {typeof label === "string" ? (
          <span className="font-terminal text-sm text-foreground/70">
            {label}
          </span>
        ) : (
          label
        )}
        {!expanded && summary && (
          <span className="font-terminal min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {summary}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-7">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
