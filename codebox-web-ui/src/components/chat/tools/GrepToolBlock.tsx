import { useState } from "react"
import { Search, ChevronRight } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ToolCallBlockProps } from "./types"
import { parseInput } from "./types"

export function GrepToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const args = parseInput<{ pattern?: string; path?: string; glob?: string }>(input)
  const pattern = args?.pattern ?? ""
  const searchPath = args?.path ?? ""
  const globPattern = args?.glob ?? ""
  const hasOutput = !!output && output.length > 0

  // Count matches (rough estimate from output lines)
  const matchCount = hasOutput ? output.split("\n").filter((l) => l.trim()).length : 0

  if (isRunning) {
    return (
      <div className="rounded-lg border-l-2 border-l-state-tool-use bg-inset px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Spinner className="size-3 text-state-tool-use" />
          <Search size={14} className="text-state-tool-use/70" />
          <span className="font-terminal text-sm text-state-tool-use">
            Searching for <code className="rounded bg-state-tool-use/10 px-1">{pattern}</code>
          </span>
        </div>
        <div className="mx-0 mt-1 h-0.5 overflow-hidden rounded-full bg-border/20">
          <div className="h-full w-1/3 rounded-full bg-state-tool-use animate-shimmer" />
        </div>
      </div>
    )
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg border-l-2 border-l-state-completed bg-card px-3 py-1.5 text-sm transition-colors hover:bg-card/80">
        <span className="size-1.5 shrink-0 rounded-full bg-state-completed" />
        <Search size={14} className="shrink-0 text-state-completed/70" />
        <code className="rounded bg-state-completed/10 px-1.5 py-0.5 font-terminal text-xs text-state-completed/70">
          {pattern}
        </code>
        {!expanded && (
          <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
            {matchCount} result{matchCount !== 1 ? "s" : ""}
          </span>
        )}
        <ChevronRight
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-0.5 border-l border-border/20 pl-2">
          <div className="flex gap-2 pt-1">
            {searchPath && (
              <span className="font-terminal text-xs text-muted-foreground">
                in {searchPath}
              </span>
            )}
            {globPattern && (
              <span className="rounded bg-card px-1.5 py-0.5 font-terminal text-[10px] text-muted-foreground">
                {globPattern}
              </span>
            )}
          </div>
          {hasOutput && (
            <pre className="mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset p-2 font-terminal text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
              {output}
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
