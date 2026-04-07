import { useState } from "react"
import { Pencil, ChevronRight } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ToolCallBlockProps } from "./types"
import { parseInput } from "./types"

export function EditFileToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const args = parseInput<{
    file_path?: string
    old_string?: string
    new_string?: string
    replace_all?: boolean
  }>(input)
  const filePath = args?.file_path ?? ""
  const fileName = filePath.split("/").pop() ?? filePath
  const oldStr = args?.old_string ?? ""
  const newStr = args?.new_string ?? ""
  const replaceAll = args?.replace_all ?? false

  if (isRunning) {
    return (
      <div className="rounded-lg border-l-2 border-l-state-writing bg-inset px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Spinner className="size-3 text-state-writing" />
          <Pencil size={14} className="text-state-writing/70" />
          <span className="font-terminal text-sm text-state-writing">
            Editing {fileName || "file"}
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
        <Pencil size={14} className="shrink-0 text-state-completed/70" />
        <span className="font-terminal text-sm font-semibold text-foreground/70">
          {fileName}
        </span>
        {replaceAll && (
          <span className="rounded bg-state-tool-use/10 px-1.5 py-0.5 font-terminal text-[10px] text-state-tool-use/70">
            replace all
          </span>
        )}
        {!expanded && (
          <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
            edited
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
          {/* Diff view */}
          <div className="mt-1 mb-0.5 overflow-auto rounded-md bg-inset font-terminal text-xs leading-relaxed">
            {oldStr && (
              <div className="border-b border-border/10">
                {oldStr.split("\n").map((line, i) => (
                  <div
                    key={`old-${i}`}
                    className="flex bg-destructive/5 px-3 py-px"
                  >
                    <span className="mr-2 select-none text-destructive/40">-</span>
                    <span className="whitespace-pre-wrap text-destructive/70">
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {newStr && (
              <div>
                {newStr.split("\n").map((line, i) => (
                  <div
                    key={`new-${i}`}
                    className="flex bg-state-completed/5 px-3 py-px"
                  >
                    <span className="mr-2 select-none text-state-completed/40">+</span>
                    <span className="whitespace-pre-wrap text-state-completed/70">
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {output && output.includes("Error") && (
            <p className="mb-0.5 font-terminal text-xs text-destructive/70">
              {output.slice(0, 200)}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
