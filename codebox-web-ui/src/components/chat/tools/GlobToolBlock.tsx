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
      <div className="flex items-center gap-2 py-1">
        <Spinner className="size-3 text-muted-foreground" />
        <FolderSearch size={14} className="text-muted-foreground" />
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
        <FolderSearch size={14} className="shrink-0 text-muted-foreground" />
        <code className="rounded bg-inset px-1.5 py-0.5 font-terminal text-xs text-foreground/70">
          {pattern}
        </code>
        {!expanded && (
          <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
            {fileCount} file{fileCount !== 1 ? "s" : ""}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-7">
          {searchPath && (
            <p className="pt-1 font-terminal text-xs text-muted-foreground">
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
