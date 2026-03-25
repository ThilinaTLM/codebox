import { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import type { EventBlock } from "./event-stream"

export function EventItem({ block }: { block: EventBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <div className="prose prose-sm prose-invert max-w-none">
          <Markdown remarkPlugins={[remarkGfm]}>{block.content}</Markdown>
        </div>
      )

    case "tool_start":
      return (
        <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          <Badge variant="outline" className="text-xs font-mono">
            {block.name}
          </Badge>
        </div>
      )

    case "tool_end":
      return <ToolEndBlock name={block.name} output={block.output} />

    case "model_start":
      return (
        <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          <span>Thinking...</span>
        </div>
      )

    case "done":
      return (
        <Alert className="mt-3 border-green-800 bg-green-950/30">
          <AlertDescription className="text-xs text-green-400">
            Task completed
          </AlertDescription>
        </Alert>
      )

    case "error":
      return (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription className="text-xs">
            {block.detail}
          </AlertDescription>
        </Alert>
      )

    case "status_change":
      return (
        <p className="py-0.5 text-xs text-muted-foreground">
          Status: {block.status}
        </p>
      )
  }
}

function ToolEndBlock({ name, output }: { name: string; output: string }) {
  const [open, setOpen] = useState(false)
  const preview = output.length > 200 ? output.slice(0, 200) + "..." : output

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1">
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <span className="font-mono text-primary">{name}</span>
        <span className="truncate max-w-[400px] opacity-60">{preview}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 ml-4 overflow-x-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap border-l-2 border-muted">
          {output}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
