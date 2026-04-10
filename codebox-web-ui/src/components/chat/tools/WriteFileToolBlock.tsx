import { useState } from "react"
import { ChevronRight, FilePlus } from "lucide-react"

import { parseInput } from "./types"
import type { ToolCallBlockProps } from "./types"
import { Spinner } from "@/components/ui/spinner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

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
      <div className="flex items-center gap-2 py-1">
        <Spinner className="size-3 text-muted-foreground" />
        <FilePlus size={14} className="text-muted-foreground" />
        <span className="font-terminal text-sm text-foreground/70">
          {fileName || "file"}
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
        <FilePlus size={14} className="shrink-0 text-muted-foreground" />
        <span className="font-terminal text-sm text-foreground/70">
          {fileName}
        </span>
        {!expanded && (
          <span className="font-terminal min-w-0 flex-1 truncate text-xs text-muted-foreground">
            wrote {lineCount} lines
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-7">
          <p className="font-terminal pt-1 text-xs text-muted-foreground">
            {filePath}
          </p>
          {content && (
            <pre className="font-terminal mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset p-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
              {content.length > 3000
                ? content.slice(0, 3000) + "\n\n… (truncated)"
                : content}
            </pre>
          )}
          {output && output.includes("Error") && (
            <p className="font-terminal mb-0.5 text-xs text-destructive/70">
              {output.slice(0, 200)}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
