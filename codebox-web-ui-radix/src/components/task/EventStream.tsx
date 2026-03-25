import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EventItem } from "./EventItem"
import type { WSEvent } from "@/net/http/types"

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

export function collapseTokens(events: WSEvent[]): EventBlock[] {
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

  flushText()
  flushExec()

  return blocks
}

export function EventStream({ events, centered }: { events: WSEvent[]; centered?: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events.length])

  const blocks = collapseTokens(events)

  return (
    <ScrollArea className="h-full">
      <div className={centered ? "mx-auto max-w-3xl px-4" : "px-5"}>
        <div className="space-y-4 py-6 text-sm">
          {blocks.map((block, i) => (
            <EventItem key={i} block={block} />
          ))}
          {events.length === 0 && (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <span className="text-sm">Waiting for events...</span>
              <span className="animate-blink">|</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </ScrollArea>
  )
}
