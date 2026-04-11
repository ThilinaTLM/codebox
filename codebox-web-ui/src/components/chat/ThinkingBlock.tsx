import { useState } from "react"
import { ChevronRight } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"

export function ThinkingBlock({
  content,
  isStreaming,
}: {
  content?: string
  isStreaming?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (isStreaming) {
    return (
      <div>
        <div className="flex items-center gap-1.5 py-1">
          <Spinner className="size-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Thinking…</span>
        </div>
        {content && (
          <p className="font-terminal pb-1 pl-4 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {content}
          </p>
        )}
      </div>
    )
  }

  if (!content) return null

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight
          size={12}
          className={`shrink-0 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <span>Thinking</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="font-terminal pb-1 pl-4 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {content}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}
