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
  | {
      kind: "exec_session"
      command?: string
      output: string
      exitCode?: string
      isRunning: boolean
    }
  | { kind: "user_message"; content: string }

export function collapseTokens(events: Array<WSEvent>): Array<EventBlock> {
  const blocks: Array<EventBlock> = []
  let textBuffer = ""
  let pendingThinking = false
  let currentExec: Extract<EventBlock, { kind: "exec_session" }> | null = null

  const flushText = () => {
    if (textBuffer) {
      blocks.push({ kind: "text", content: textBuffer })
      textBuffer = ""
    }
  }

  const flushExec = () => {
    if (currentExec) {
      blocks.push(currentExec)
      currentExec = null
    }
  }

  for (const event of events) {
    if (event.type === "ping" || event.type === "message_complete") continue

    if (event.type === "token") {
      flushExec()
      pendingThinking = false
      textBuffer += event.text
      continue
    }

    if (event.type === "user_exec") {
      flushText()
      flushExec()
      pendingThinking = false
      currentExec = { kind: "exec_session", command: event.command, output: "", isRunning: true }
      continue
    }

    if (event.type === "exec_output") {
      flushText()
      pendingThinking = false
      if (!currentExec) {
        currentExec = { kind: "exec_session", output: "", isRunning: true }
      }
      currentExec.output += event.output
      continue
    }

    if (event.type === "exec_done") {
      flushText()
      pendingThinking = false
      if (!currentExec) {
        currentExec = { kind: "exec_session", output: "", isRunning: false }
      }
      currentExec.exitCode = event.output
      currentExec.isRunning = false
      flushExec()
      continue
    }

    flushText()
    flushExec()

    switch (event.type) {
      case "model_start":
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
    }
  }

  flushText()
  flushExec()

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
        <div className={`space-y-3 py-6 text-sm ${bottomInset ? "pb-32" : ""}`}>
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
