import { useState } from "react"
import { FileText, ChevronRight } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ToolCallBlockProps } from "./types"
import { parseInput } from "./types"

export function ReadFileToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const args = parseInput<{ file_path?: string; offset?: number; limit?: number }>(input)
  const filePath = args?.file_path ?? ""
  const fileName = filePath.split("/").pop() ?? filePath
  const hasOutput = !!output && output.length > 0
  const lineCount = hasOutput ? output.split("\n").length : 0

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 py-1">
        <Spinner className="size-3 text-muted-foreground" />
        <FileText size={14} className="text-muted-foreground" />
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
        <FileText size={14} className="shrink-0 text-muted-foreground" />
        <span className="font-terminal text-sm text-foreground/70">{fileName}</span>
        {!expanded && hasOutput && (
          <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
            {lineCount} lines
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-7">
          {filePath && (
            <p className="pt-1 font-terminal text-xs text-muted-foreground">
              {filePath}
              {args?.offset ? ` (offset: ${args.offset})` : ""}
            </p>
          )}
          {hasOutput && (
            <pre className="mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset font-terminal text-xs leading-relaxed text-foreground/80">
              <table className="w-full border-collapse">
                <tbody>
                  {output.split("\n").map((line, i) => (
                    <tr key={i} className="hover:bg-border/5">
                      <td className="w-8 select-none pr-3 text-right align-top text-ghost/60">
                        {(args?.offset ?? 0) + i + 1}
                      </td>
                      <td className="whitespace-pre-wrap py-px pl-3 align-top">
                        {line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
