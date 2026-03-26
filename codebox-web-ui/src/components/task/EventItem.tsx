import { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"
import type { EventBlock } from "./EventStream"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"

export function EventItem({ block }: { block: EventBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <div className="prose max-w-none dark:prose-invert prose-a:text-primary prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-primary/80 prose-pre:rounded-xl prose-pre:bg-muted">
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
          <span className="text-xs font-medium text-muted-foreground">
            Reasoning
          </span>
        </div>
      )

    case "tool_call":
      return (
        <ToolCallBlock
          name={block.name}
          input={block.input}
          output={block.output}
          isRunning={block.isRunning}
        />
      )

    case "done":
      return (
        <div className="flex items-center gap-2 py-1">
          <div className="h-px flex-1 bg-success/25" />
          <div className="flex items-center gap-1.5 text-success/70">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
            <span className="text-sm font-medium">Completed</span>
          </div>
          <div className="h-px flex-1 bg-success/25" />
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
          <span className="text-sm text-muted-foreground">{block.status}</span>
          <div className="h-px flex-1 bg-border/50" />
        </div>
      )

    case "exec_session":
      return <ExecSessionBlock block={block} />

    case "user_message":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl bg-primary/10 px-4 py-3">
            <p className="text-base">{block.content}</p>
          </div>
        </div>
      )

  }
}

function ExecSessionBlock({
  block,
}: {
  block: Extract<EventBlock, { kind: "exec_session" }>
}) {
  const hasOutput = block.output.length > 0
  const hasCommand = !!block.command
  const isSuccess = block.exitCode === "0"

  return (
    <div className="overflow-hidden rounded-xl border border-border/40">
      {/* Command header */}
      {hasCommand && (
        <div className="terminal-bg flex items-center gap-2 px-4 py-2.5 font-mono text-sm">
          <span className="select-none text-success/80">$</span>
          <span className="text-foreground/90">{block.command}</span>
          {block.isRunning && <Spinner className="ml-auto size-3 text-muted-foreground" />}
        </div>
      )}

      {/* Output body */}
      {hasOutput && (
        <pre
          className={`terminal-bg max-h-[400px] overflow-auto px-4 py-3 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground/80 ${hasCommand || (!hasCommand && block.exitCode != null) ? "border-t border-border/20" : ""}`}
        >
          {block.output}
        </pre>
      )}

      {/* Running indicator when no command and no output yet */}
      {!hasCommand && !hasOutput && block.isRunning && (
        <div className="terminal-bg flex items-center gap-2 px-4 py-2.5">
          <Spinner className="size-3 text-muted-foreground" />
          <span className="font-mono text-sm text-muted-foreground">Running...</span>
        </div>
      )}

      {/* Exit code footer */}
      {block.exitCode != null && (
        <div className="terminal-bg flex items-center justify-end gap-1.5 border-t border-border/20 px-4 py-1.5">
          <span className="font-mono text-xs text-muted-foreground">exit</span>
          <span
            className={`font-mono text-xs font-medium ${isSuccess ? "text-success" : "text-destructive"}`}
          >
            {block.exitCode}
          </span>
        </div>
      )}
    </div>
  )
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
    // In-progress state
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

  // Completed state
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
