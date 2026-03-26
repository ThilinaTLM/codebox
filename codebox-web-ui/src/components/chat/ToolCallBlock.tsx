import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
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

  const inputPreview = hasInput
    ? input.length > 80
      ? input.slice(0, 80) + "\u2026"
      : input
    : ""

  const outputPreview = hasOutput
    ? output.length > 120
      ? output.slice(0, 120) + "\u2026"
      : output
    : ""

  if (isRunning) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20">
        <div className="flex items-center gap-2 px-3 py-2">
          <Spinner className="size-3 text-primary/60" />
          <span className="font-mono text-sm font-medium text-foreground/80">
            {name}
          </span>
          {hasInput && (
            <button
              onClick={() => setArgsExpanded(!argsExpanded)}
              className="ml-auto flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon
                icon={argsExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                size={10}
              />
              args
            </button>
          )}
        </div>
        {hasInput && !argsExpanded && (
          <div className="border-t border-border/30 px-3 py-1.5">
            <code className="block truncate font-mono text-sm text-muted-foreground">
              {inputPreview}
            </code>
          </div>
        )}
        {hasInput && argsExpanded && (
          <div className="border-t border-border/30 px-3 py-2">
            <pre className="overflow-x-auto font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground/70">
              {formatJson(input)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-sm transition-colors hover:bg-muted/30">
        <span className="size-1.5 shrink-0 rounded-full bg-success" />
        <span className="font-mono text-sm font-medium text-foreground/70">
          {name}
        </span>
        {!expanded && outputPreview && (
          <span className="flex-1 truncate font-mono text-sm text-muted-foreground">
            {outputPreview}
          </span>
        )}
        <span className="shrink-0 text-sm text-muted-foreground">
          {expanded ? "Collapse" : "Expand"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-1 border-l-2 border-border/30 pl-3">
          {hasInput && (
            <div className="pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setArgsExpanded(!argsExpanded)
                }}
                className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={argsExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                  size={10}
                />
                Input
              </button>
              {argsExpanded && (
                <pre className="mt-1 overflow-x-auto rounded-lg bg-muted/20 p-2 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground/70">
                  {formatJson(input)}
                </pre>
              )}
            </div>
          )}
          {hasOutput && (
            <pre className="mt-2 mb-1 overflow-x-auto rounded-lg bg-muted/20 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
              {formatJson(output)}
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
