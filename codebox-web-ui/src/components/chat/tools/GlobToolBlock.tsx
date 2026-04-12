import { useState } from "react"
import { ChevronRight, FolderSearch } from "lucide-react"

import { parseInput } from "./types"
import type { ToolCallBlockProps } from "./types"
import { Spinner } from "@/components/ui/spinner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

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
  const fileCount = hasOutput
    ? output.split("\n").filter((l) => l.trim()).length
    : 0

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Spinner className="size-3 text-state-tool-use" />
        <FolderSearch size={12} className="text-muted-foreground" />
        <span className="font-terminal text-sm text-foreground/70">
          <code className="rounded border border-border/20 bg-inset px-1">{pattern}</code>
        </span>
      </div>
    )
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/50">
        <ChevronRight
          size={12}
          className={`shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <span className="size-1.5 shrink-0 rounded-full bg-state-completed" />
        <FolderSearch size={12} className="shrink-0 text-muted-foreground" />
        <code className="font-terminal rounded border border-border/20 bg-inset px-1.5 py-0.5 text-xs text-foreground/70">
          {pattern}
        </code>
        {!expanded && (
          <span className="font-terminal min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {fileCount} file{fileCount !== 1 ? "s" : ""}
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
            <div className="mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset p-2">
              {output
                .split("\n")
                .filter((l) => l.trim())
                .map((file, i) => (
                  <div
                    key={i}
                    className="font-terminal py-0.5 text-xs text-foreground/80 hover:text-primary"
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
