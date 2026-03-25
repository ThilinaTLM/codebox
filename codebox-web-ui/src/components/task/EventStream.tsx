import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EventItem } from "./EventItem"
import type { WSEvent } from "@/net/http/types"

export function EventStream({ events }: { events: WSEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events.length])

  // Collapse consecutive token events into text blocks
  const blocks = collapseTokens(events)

  return (
    <ScrollArea className="h-full">
      <div className="terminal-bg bg-grid space-y-1 p-5 font-mono text-sm">
        {blocks.map((block, i) => (
          <EventItem key={i} block={block} />
        ))}
        {events.length === 0 && (
          <p className="font-mono text-sm text-muted-foreground">
            <span className="text-primary/60">&gt;</span> waiting for events
            <span className="animate-blink">_</span>
          </p>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}

export type EventBlock =
  | { kind: "text"; content: string }
  | { kind: "tool_start"; name: string }
  | { kind: "tool_end"; name: string; output: string }
  | { kind: "model_start" }
  | { kind: "done"; content: string }
  | { kind: "error"; detail: string }
  | { kind: "status_change"; status: string }
  | { kind: "exec_output"; output: string }
  | { kind: "exec_done"; exitCode: string }
  | { kind: "user_message"; content: string }
  | { kind: "user_exec"; command: string }

function collapseTokens(events: WSEvent[]): EventBlock[] {
  const blocks: EventBlock[] = []
  let textBuffer = ""
  let execBuffer = ""

  const flushText = () => {
    if (textBuffer) {
      blocks.push({ kind: "text", content: textBuffer })
      textBuffer = ""
    }
  }

  const flushExec = () => {
    if (execBuffer) {
      blocks.push({ kind: "exec_output", output: execBuffer })
      execBuffer = ""
    }
  }

  for (const event of events) {
    if (event.type === "ping") continue

    if (event.type === "token") {
      flushExec()
      textBuffer += event.text
      continue
    }

    if (event.type === "exec_output") {
      flushText()
      execBuffer += event.output
      continue
    }

    // Flush buffers before other events
    flushText()
    flushExec()

    switch (event.type) {
      case "tool_start":
        blocks.push({ kind: "tool_start", name: event.name })
        break
      case "tool_end":
        blocks.push({ kind: "tool_end", name: event.name, output: event.output })
        break
      case "model_start":
        blocks.push({ kind: "model_start" })
        break
      case "done":
        blocks.push({ kind: "done", content: event.content })
        break
      case "error":
        blocks.push({ kind: "error", detail: event.detail })
        break
      case "status_change":
        blocks.push({ kind: "status_change", status: event.status })
        break
      case "exec_done":
        blocks.push({ kind: "exec_done", exitCode: event.output })
        break
    }
  }

  // Flush remaining buffers
  flushText()
  flushExec()

  return blocks
}
