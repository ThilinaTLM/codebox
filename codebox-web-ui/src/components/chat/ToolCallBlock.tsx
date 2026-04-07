import { useState } from "react"
import { ChevronRight } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"

function formatJson(str: string) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}

function getOutputSummary(output: string): string {
  if (!output) return ""
  // Try to extract meaningful summary from JSON
  try {
    const parsed = JSON.parse(output)
    if (typeof parsed === "string") return parsed.slice(0, 80)
    if (parsed.content) return String(parsed.content).slice(0, 80)
    if (parsed.result) return String(parsed.result).slice(0, 80)
    if (parsed.output) return String(parsed.output).slice(0, 80)
  } catch {
    // Not JSON, use raw text
  }
  return output.length > 80 ? output.slice(0, 80) + "\u2026" : output
}

export function ToolCallBlock({
  name,
  input,
  output,
  isRunning,
}: {
  name: string
  input?: string
  output?: string
  isRunning: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [argsExpanded, setArgsExpanded] = useState(false)
  const hasInput = !!input && input.length > 0
  const hasOutput = !!output && output.length > 0

  const inputPreview = hasInput
    ? input.length > 120
      ? input.slice(0, 120) + "\u2026"
      : input
    : ""

  if (isRunning) {
    return (
      <div className="rounded-lg border-l-2 border-l-state-tool-use bg-inset">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <Spinner className="size-3 text-state-tool-use" />
          <span className="rounded bg-state-tool-use/10 px-1.5 py-0.5 font-terminal text-[10px] uppercase tracking-wider text-state-tool-use/70">
            tool
          </span>
          <span className="font-terminal text-sm font-semibold text-state-tool-use">
            {name}
          </span>
        </div>
        {/* Always show input preview when running */}
        {hasInput && (
          <div className="border-t border-border/20 px-3 py-1">
            <button
              onClick={() => setArgsExpanded(!argsExpanded)}
              className="mb-0.5 flex items-center gap-1 font-terminal text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight
                size={10}
                className={`transition-transform ${argsExpanded ? "rotate-90" : ""}`}
              />
              Input
            </button>
            {argsExpanded ? (
              <pre className="overflow-x-auto font-terminal text-xs leading-relaxed whitespace-pre-wrap text-foreground/70">
                {formatJson(input)}
              </pre>
            ) : (
              <code className="block truncate font-terminal text-xs text-muted-foreground">
                {inputPreview}
              </code>
            )}
          </div>
        )}
        {/* Shimmer bar */}
        <div className="mx-3 mb-1 h-0.5 overflow-hidden rounded-full bg-border/20">
          <div className="h-full w-1/3 rounded-full bg-state-tool-use animate-shimmer" />
        </div>
      </div>
    )
  }

  const outputSummary = hasOutput ? getOutputSummary(output) : ""

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg border-l-2 border-l-state-completed bg-card px-3 py-1.5 text-sm transition-colors hover:bg-card/80">
        <span className="size-1.5 shrink-0 rounded-full bg-state-completed" />
        <span className="rounded bg-state-completed/10 px-1.5 py-0.5 font-terminal text-[10px] uppercase tracking-wider text-state-completed/70">
          tool
        </span>
        <span className="font-terminal text-sm font-semibold text-foreground/70">
          {name}
        </span>
        {!expanded && outputSummary && (
          <span className="min-w-0 flex-1 truncate font-terminal text-xs text-muted-foreground">
            {outputSummary}
          </span>
        )}
        <ChevronRight
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-0.5 border-l border-border/20 pl-2">
          {hasInput && (
            <div className="pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setArgsExpanded(!argsExpanded)
                }}
                className="flex items-center gap-1 font-terminal text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronRight
                  size={10}
                  className={`transition-transform ${argsExpanded ? "rotate-90" : ""}`}
                />
                Input
              </button>
              {argsExpanded && (
                <pre className="mt-1 overflow-x-auto rounded-md bg-inset p-1.5 font-terminal text-xs leading-relaxed whitespace-pre-wrap text-foreground/70">
                  {formatJson(input)}
                </pre>
              )}
            </div>
          )}
          {hasOutput && (
            <div className="pt-1">
              <span className="font-terminal text-xs text-muted-foreground">
                Output
              </span>
              <pre className="mt-1 mb-0.5 overflow-x-auto rounded-md bg-inset p-2 font-terminal text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
                {formatJson(output)}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
