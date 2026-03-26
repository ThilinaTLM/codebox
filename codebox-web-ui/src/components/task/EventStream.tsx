import { useEffect, useRef } from "react"
import { EventItem } from "./EventItem"
import type { WSEvent } from "@/net/http/types"
import { ScrollArea } from "@/components/ui/scroll-area"

export type EventBlock =
  | { kind: "text"; content: string }
  | { kind: "thinking" }
  | {
      kind: "tool_call"
      name: string
      input?: string
      output?: string
      isRunning: boolean
    }
  | { kind: "done"; content: string }
  | { kind: "error"; detail: string }
  | { kind: "status_change"; status: string }
  | { kind: "exec_output"; output: string }
  | { kind: "exec_done"; exitCode: string }
  | { kind: "user_message"; content: string }
  | { kind: "user_exec"; command: string }

export function collapseTokens(events: Array<WSEvent>): Array<EventBlock> {
  const blocks: Array<EventBlock> = []
  let textBuffer = ""
  let execBuffer = ""
  let pendingThinking = false

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
      pendingThinking = false
      textBuffer += event.text
      continue
    }

    if (event.type === "exec_output") {
      flushText()
      pendingThinking = false
      execBuffer += event.output
      continue
    }

    flushText()
    flushExec()

    switch (event.type) {
      case "model_start":
        // Mark as pending — only emit if nothing else follows
        pendingThinking = true
        break

      case "tool_start": {
        pendingThinking = false
        blocks.push({
          kind: "tool_call",
          name: event.name,
          input: event.input,
          isRunning: true,
        })
        break
      }

      case "tool_end": {
        // Find the last running tool_call with the same name and mark it complete
        let matched = false
        for (let j = blocks.length - 1; j >= 0; j--) {
          const b = blocks[j]
          if (b.kind === "tool_call" && b.name === event.name && b.isRunning) {
            b.output = event.output
            b.isRunning = false
            matched = true
            break
          }
        }
        if (!matched) {
          blocks.push({
            kind: "tool_call",
            name: event.name,
            output: event.output,
            isRunning: false,
          })
        }
        break
      }

      case "done":
        pendingThinking = false
        blocks.push({ kind: "done", content: event.content })
        break
      case "error":
        pendingThinking = false
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

  // Only show thinking indicator if model is currently thinking (last meaningful event)
  if (pendingThinking) {
    blocks.push({ kind: "thinking" })
  }

  return blocks
}

export function EventStream({
  events,
  centered,
  bottomInset,
}: {
  events: Array<WSEvent>
  centered?: boolean
  bottomInset?: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events.length])

  const blocks = collapseTokens(events)

  return (
    <ScrollArea className="h-full">
      <div className={centered ? "mx-auto max-w-3xl px-4" : "px-5"}>
        <div className={`space-y-3 py-6 text-sm ${bottomInset ? "pb-24" : ""}`}>
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
