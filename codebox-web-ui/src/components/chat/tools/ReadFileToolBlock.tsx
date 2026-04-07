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

function extToLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    css: "css",
    html: "html",
    sh: "bash",
    bash: "bash",
  }
  return ext ? (map[ext] ?? "") : ""
}

export function ReadFileToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const args = parseInput<{ file_path?: string; offset?: number; limit?: number }>(input)
  const filePath = args?.file_path ?? ""
  const fileName = filePath.split("/").pop() ?? filePath
  const lang = extToLang(filePath)
  const hasOutput = !!output && output.length > 0
  const lineCount = hasOutput ? output.split("\n").length : 0

  if (isRunning) {
    return (
      <div className="rounded-lg border-l-2 border-l-state-tool-use bg-inset px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Spinner className="size-3 text-state-tool-use" />
          <FileText size={14} className="text-state-tool-use/70" />
          <span className="font-terminal text-sm text-state-tool-use">
            Reading {fileName || "file"}
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
        <FileText size={14} className="shrink-0 text-state-completed/70" />
        <span className="font-terminal text-sm font-semibold text-foreground/70">
          {fileName}
        </span>
        {!expanded && hasOutput && (
          <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
            {lineCount} lines
          </span>
        )}
        <ChevronRight
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-0.5 border-l border-border/20 pl-2">
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
          {lang && (
            <span className="mb-0.5 inline-block rounded bg-card px-1.5 py-0.5 font-terminal text-[10px] text-muted-foreground">
              {lang}
            </span>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
