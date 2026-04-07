import { useState } from "react"
import { FilePlus, ChevronRight } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ToolCallBlockProps } from "./types"
import { parseInput } from "./types"

export function WriteFileToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const args = parseInput<{ file_path?: string; content?: string }>(input)
  const filePath = args?.file_path ?? ""
  const fileName = filePath.split("/").pop() ?? filePath
  const content = args?.content ?? ""
  const lineCount = content ? content.split("\n").length : 0

  if (isRunning) {
    return (
      <div className="rounded-lg border-l-2 border-l-state-writing bg-inset px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Spinner className="size-3 text-state-writing" />
          <FilePlus size={14} className="text-state-writing/70" />
          <span className="font-terminal text-sm text-state-writing">
            Writing {fileName || "file"}
          </span>
        </div>
        <div className="mx-0 mt-1 h-0.5 overflow-hidden rounded-full bg-border/20">
          <div className="h-full w-1/3 rounded-full bg-state-writing animate-shimmer" />
        </div>
      </div>
    )
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg border-l-2 border-l-state-completed bg-card px-3 py-1.5 text-sm transition-colors hover:bg-card/80">
        <span className="size-1.5 shrink-0 rounded-full bg-state-completed" />
        <FilePlus size={14} className="shrink-0 text-state-completed/70" />
        <span className="font-terminal text-sm font-semibold text-foreground/70">
          {fileName}
        </span>
        {!expanded && (
          <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
            wrote {lineCount} lines
          </span>
        )}
        <ChevronRight
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-0.5 border-l border-border/20 pl-2">
          <p className="pt-1 font-terminal text-xs text-muted-foreground">
            {filePath}
          </p>
          {content && (
            <pre className="mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset p-2 font-terminal text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
              {content.length > 3000 ? content.slice(0, 3000) + "\n\n... (truncated)" : content}
            </pre>
          )}
          {output && (
            <p className="mb-0.5 font-terminal text-xs text-state-completed/70">
              {output.includes("Error") ? output.slice(0, 120) : "File created successfully"}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
