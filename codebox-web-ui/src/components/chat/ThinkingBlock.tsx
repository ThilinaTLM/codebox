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
      <div className="flex items-center gap-1.5 px-1 py-1">
        <Spinner className="size-3 text-muted-foreground" />
        <span className="text-sm italic text-muted-foreground">
          Thinking…
        </span>
      </div>
    )
  }

  if (!content) return null

  return (
    <div className="px-1 py-1">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          size={12}
          className={cn(
            "shrink-0 transition-transform duration-150",
            expanded && "rotate-90"
          )}
        />
        <span className="italic">Thinking</span>
      </button>
      {expanded && (
        <p className="mt-1 pl-5 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {content}
        </p>
      )}
    </div>
  )
}
