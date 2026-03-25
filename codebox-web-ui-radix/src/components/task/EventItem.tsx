import { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import type { EventBlock } from "./EventStream"

export function EventItem({ block }: { block: EventBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:text-primary/80 prose-pre:rounded-xl prose-pre:bg-muted prose-a:text-primary">
          <Markdown remarkPlugins={[remarkGfm]}>{block.content}</Markdown>
        </div>
      )

    case "tool_start":
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
          <Spinner className="size-3" />
          <Badge variant="outline" className="border-success/20 bg-success/5 font-mono text-xs text-success">
            {block.name}
          </Badge>
        </div>
      )

    case "tool_end":
      return <ToolEndBlock name={block.name} output={block.output} />

    case "model_start":
      return (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Spinner className="size-3" />
          <span>Thinking...</span>
        </div>
      )

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
          <div className="max-w-[85%] rounded-2xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-yellow-500/30 text-xs text-yellow-600 dark:text-yellow-400">
                shell
              </Badge>
              <code className="font-mono text-sm">{block.command}</code>
            </div>
          </div>
        </div>
      )
  }
}

function ToolEndBlock({ name, output }: { name: string; output: string }) {
  const [open, setOpen] = useState(false)
  const preview = output.length > 120 ? output.slice(0, 120) + "..." : output

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm transition-colors hover:bg-muted/50">
        <span className="font-mono text-xs text-success">{name}</span>
        <span className="flex-1 truncate text-xs text-muted-foreground">{preview}</span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-xl border-l-2 border-success/20 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          {output}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
