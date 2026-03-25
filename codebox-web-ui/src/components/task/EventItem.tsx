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
        <div className="prose prose-sm dark:prose-invert max-w-none prose-code:font-mono prose-code:text-primary/80 prose-a:text-primary">
          <Markdown remarkPlugins={[remarkGfm]}>{block.content}</Markdown>
        </div>
      )

    case "tool_start":
      return (
        <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
          <Spinner className="size-3" />
          <span className="font-mono text-primary/60">&gt;</span>
          <Badge variant="outline" className="border-success/20 bg-success/5 font-mono text-xs text-success">
            {block.name}
          </Badge>
        </div>
      )

    case "tool_end":
      return <ToolEndBlock name={block.name} output={block.output} />

    case "model_start":
      return (
        <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
          <Spinner className="size-3" />
          <span className="font-mono">processing</span>
          <span className="animate-blink font-mono">_</span>
        </div>
      )

    case "done":
      return (
        <Alert className="mt-3 border-success/30 bg-success/5">
          <AlertDescription className="font-mono text-sm text-success">
            Task completed
          </AlertDescription>
        </Alert>
      )

    case "error":
      return (
        <Alert className="mt-3 border-destructive/30 bg-destructive/5">
          <AlertDescription className="font-mono text-sm text-destructive">
            {block.detail}
          </AlertDescription>
        </Alert>
      )

    case "status_change":
      return (
        <p className="py-0.5 font-mono text-xs text-warning">
          <span className="text-warning/60">&gt;</span> status: {block.status}
        </p>
      )

    case "exec_output":
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/60 p-2 font-mono text-sm text-green-400/90">
          {block.output}
        </pre>
      )

    case "exec_done":
      return (
        <p className="py-0.5 font-mono text-xs text-muted-foreground">
          <span className="text-muted-foreground/60">&gt;</span> exit:{" "}
          <span className={block.exitCode === "0" ? "text-success" : "text-destructive"}>
            {block.exitCode}
          </span>
        </p>
      )

    case "user_message":
      return (
        <div className="mt-2 mb-1 rounded border-l-2 border-primary/40 bg-primary/5 p-2">
          <p className="font-mono text-xs text-primary/70">you:</p>
          <p className="font-mono text-sm">{block.content}</p>
        </div>
      )

    case "user_exec":
      return (
        <p className="mt-2 mb-1 font-mono text-sm text-primary/80">
          <span className="text-yellow-500">!</span> {block.command}
        </p>
      )
  }
}

function ToolEndBlock({ name, output }: { name: string; output: string }) {
  const [open, setOpen] = useState(false)
  const preview = output.length > 200 ? output.slice(0, 200) + "..." : output

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1">
      <CollapsibleTrigger className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <span className="font-mono text-success">{name}</span>
        <span className="max-w-[400px] truncate opacity-60">{preview}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 ml-4 overflow-x-auto whitespace-pre-wrap rounded border-l-2 border-success/30 bg-muted/50 p-2 text-sm">
          {output}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
