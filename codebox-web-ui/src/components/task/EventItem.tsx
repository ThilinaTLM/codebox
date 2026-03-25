import { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import type { EventBlock } from "./EventStream"

export function EventItem({ block }: { block: EventBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-primary/80 prose-pre:rounded-xl prose-pre:bg-muted prose-a:text-primary">
          <Markdown remarkPlugins={[remarkGfm]}>{block.content}</Markdown>
        </div>
      )

    case "thinking":
      return (
        <div className="flex items-center gap-2.5 py-2">
          <div className="flex items-center gap-1">
            <span className="thinking-dot-1 inline-block size-1.5 rounded-full bg-primary" />
            <span className="thinking-dot-2 inline-block size-1.5 rounded-full bg-primary" />
            <span className="thinking-dot-3 inline-block size-1.5 rounded-full bg-primary" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Reasoning</span>
        </div>
      )

    case "tool_call":
      return <ToolCallBlock name={block.name} input={block.input} output={block.output} isRunning={block.isRunning} />

    case "done":
      return (
        <div className="rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success">
          Task completed
        </div>
      )

    case "error":
      return (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {block.detail}
        </div>
      )

    case "status_change":
      return (
        <div className="flex items-center gap-2 py-1">
          <div className="h-px flex-1 bg-border/50" />
          <span className="text-xs text-muted-foreground">{block.status}</span>
          <div className="h-px flex-1 bg-border/50" />
        </div>
      )

    case "exec_output":
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-muted p-4 font-mono text-sm leading-relaxed text-foreground/90">
          {block.output}
        </pre>
      )

    case "exec_done":
      return (
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <span>Exit:</span>
          <span className={block.exitCode === "0" ? "text-success" : "text-destructive"}>
            {block.exitCode}
          </span>
        </div>
      )

    case "user_message":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl bg-primary/10 px-4 py-3">
            <p className="text-sm">{block.content}</p>
          </div>
        </div>
      )

    case "user_exec":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl border border-warning/20 bg-warning/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-warning/30 text-xs text-warning">
                shell
              </Badge>
              <code className="font-mono text-sm">{block.command}</code>
            </div>
          </div>
        </div>
      )
  }
}

function ToolCallBlock({
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

  // Try to pretty-format JSON for display
  const formatJson = (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2)
    } catch {
      return str
    }
  }

  const inputPreview = hasInput
    ? input.length > 80 ? input.slice(0, 80) + "\u2026" : input
    : ""

  const outputPreview = hasOutput
    ? output.length > 120 ? output.slice(0, 120) + "\u2026" : output
    : ""

  if (isRunning) {
    // In-progress state
    return (
      <div className="rounded-lg border border-border/50 bg-muted/20">
        <div className="flex items-center gap-2 px-3 py-2">
          <Spinner className="size-3 text-primary/60" />
          <span className="font-mono text-xs font-medium text-foreground/80">{name}</span>
          {hasInput && (
            <button
              onClick={() => setArgsExpanded(!argsExpanded)}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={argsExpanded ? ArrowDown01Icon : ArrowRight01Icon} size={10} />
              args
            </button>
          )}
        </div>
        {hasInput && !argsExpanded && (
          <div className="border-t border-border/30 px-3 py-1.5">
            <code className="block truncate font-mono text-xs text-muted-foreground">{inputPreview}</code>
          </div>
        )}
        {hasInput && argsExpanded && (
          <div className="border-t border-border/30 px-3 py-2">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/70">
              {formatJson(input)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  // Completed state
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-sm transition-colors hover:bg-muted/30">
        <span className="size-1.5 shrink-0 rounded-full bg-success" />
        <span className="font-mono text-xs font-medium text-foreground/70">{name}</span>
        {!expanded && outputPreview && (
          <span className="flex-1 truncate font-mono text-xs text-muted-foreground">{outputPreview}</span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
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
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <HugeiconsIcon icon={argsExpanded ? ArrowDown01Icon : ArrowRight01Icon} size={10} />
                Input
              </button>
              {argsExpanded && (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/20 p-2 font-mono text-xs leading-relaxed text-foreground/70">
                  {formatJson(input)}
                </pre>
              )}
            </div>
          )}
          {hasOutput && (
            <pre className="mt-2 mb-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground/80">
              {formatJson(output)}
            </pre>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
