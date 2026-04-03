import { useState } from "react"
import { FolderSearch, ChevronRight } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ToolCallBlockProps } from "./types"
import { parseInput } from "./types"

export function GlobToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const args = parseInput<{ pattern?: string; path?: string }>(input)
  const pattern = args?.pattern ?? ""
  const searchPath = args?.path ?? ""
  const hasOutput = !!output && output.length > 0
  const fileCount = hasOutput ? output.split("\n").filter((l) => l.trim()).length : 0

  if (isRunning) {
    return (
      <div className="rounded-lg border-l-2 border-l-state-tool-use bg-inset px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Spinner className="size-3 text-state-tool-use" />
          <FolderSearch size={14} className="text-state-tool-use/70" />
          <span className="font-terminal text-sm text-state-tool-use">
            Matching <code className="rounded bg-state-tool-use/10 px-1">{pattern}</code>
          </span>
        </div>
        <div className="mx-0 mt-2 h-0.5 overflow-hidden rounded-full bg-border/20">
          <div className="h-full w-1/3 rounded-full bg-state-tool-use animate-shimmer" />
        </div>
      </div>
    )
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg border-l-2 border-l-state-completed bg-card px-3 py-2.5 text-sm transition-colors hover:bg-card/80">
        <span className="size-1.5 shrink-0 rounded-full bg-state-completed" />
        <FolderSearch size={14} className="shrink-0 text-state-completed/70" />
        <code className="rounded bg-state-completed/10 px-1.5 py-0.5 font-terminal text-xs text-state-completed/70">
          {pattern}
        </code>
        {!expanded && (
          <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
            {fileCount} file{fileCount !== 1 ? "s" : ""}
          </span>
        )}
        <ChevronRight
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-1 border-l border-border/20 pl-3">
          {searchPath && (
            <p className="pt-2 font-terminal text-xs text-muted-foreground">
              in {searchPath}
            </p>
          )}
          {hasOutput && (
            <div className="mt-2 mb-1 max-h-[300px] overflow-auto rounded-md bg-inset p-3">
              {output
                .split("\n")
                .filter((l) => l.trim())
                .map((file, i) => (
                  <div
                    key={i}
                    className="py-0.5 font-terminal text-xs text-foreground/80 hover:text-foreground"
                  >
                    {file}
                  </div>
                ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
