import { useState } from "react"
import { ChevronRight, Search } from "lucide-react"

import { parseInput } from "./types"
import type { ToolCallBlockProps } from "./types"
import { Spinner } from "@/components/ui/spinner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

export function GrepToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const args = parseInput<{ pattern?: string; path?: string; glob?: string }>(
    input
  )
  const pattern = args?.pattern ?? ""
  const searchPath = args?.path ?? ""
  const hasOutput = !!output && output.length > 0

  const matchCount = hasOutput
    ? output.split("\n").filter((l) => l.trim()).length
    : 0

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Spinner className="size-3 text-muted-foreground" />
        <Search size={14} className="text-muted-foreground" />
        <span className="font-terminal text-sm text-foreground/70">
          <code className="rounded bg-inset px-1">{pattern}</code>
        </span>
      </div>
    )
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-card/80">
        <ChevronRight
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <span className="size-1.5 shrink-0 rounded-full bg-state-completed" />
        <Search size={14} className="shrink-0 text-muted-foreground" />
        <code className="font-terminal rounded bg-inset px-1.5 py-0.5 text-xs text-foreground/70">
          {pattern}
        </code>
        {!expanded && (
          <span className="font-terminal min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {matchCount} result{matchCount !== 1 ? "s" : ""}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-7">
          {searchPath && (
            <p className="font-terminal pt-1 text-xs text-muted-foreground">
              in {searchPath}
            </p>
          )}
          {hasOutput && (
            <pre className="font-terminal mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset p-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
              {output}
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
