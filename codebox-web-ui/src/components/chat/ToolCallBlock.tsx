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

  if (isRunning) {
    return (
      <div className="rounded-xl border border-border/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Spinner className="size-3 text-state-tool-use" />
          <span className="font-terminal text-sm text-foreground/70">{name}</span>
        </div>
      </div>
    )
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="rounded-xl border border-border/40">
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent/50">
        <ChevronRight
          size={12}
          className={`shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
        />
        <span className="size-1.5 shrink-0 rounded-full bg-state-completed" />
        <span className="font-terminal text-sm text-foreground/70">{name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 pl-7">
          {hasInput && (
            <div className="pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setArgsExpanded(!argsExpanded)
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-state-tool-use"
              >
                <ChevronRight
                  size={10}
                  className={`transition-transform ${argsExpanded ? "rotate-90" : ""}`}
                />
                Input
              </button>
              {argsExpanded && (
                <pre className="font-terminal mt-1 overflow-x-auto rounded-md bg-inset p-1.5 text-xs leading-relaxed whitespace-pre-wrap text-foreground/70">
                  {formatJson(input)}
                </pre>
              )}
            </div>
          )}
          {hasOutput && (
            <div className="pt-1">
              <span className="text-xs text-muted-foreground">Output</span>
              <pre className="font-terminal mt-1 mb-0.5 overflow-x-auto rounded-md bg-inset p-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
                {formatJson(output)}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
