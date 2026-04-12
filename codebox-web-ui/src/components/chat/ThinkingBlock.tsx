import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

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
      <div className="rounded-xl border-l-2 border-state-thinking/40 bg-state-thinking/5 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Spinner className="size-3 text-state-thinking" />
          <span className="text-sm font-medium text-state-thinking">
            Thinking…
          </span>
        </div>
        {content && (
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {content}
          </p>
        )}
      </div>
    )
  }

  if (!content) return null

  return (
    <div className="rounded-xl border-l-2 border-state-thinking/40 bg-state-thinking/5 px-4 py-3">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-state-thinking"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          size={14}
          className={cn(
            "shrink-0 transition-transform duration-150",
            expanded && "rotate-90"
          )}
        />
        <span className="font-medium">Thinking</span>
      </button>
      <div
        className={cn(
          "mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground",
          !expanded && "line-clamp-3"
        )}
      >
        {content}
      </div>
    </div>
  )
}
