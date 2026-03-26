import { useEffect, useRef } from "react"
import { ChatBlock } from "./ChatBlock"
import type { EventBlock } from "./types"
import type { BoxStreamEvent } from "@/net/http/types"
import { ScrollArea } from "@/components/ui/scroll-area"

export function collapseTokens(events: Array<BoxStreamEvent>): Array<EventBlock> {
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
    if (event.type === "message_complete") continue

    if (event.type === "token") {
      flushExec()
      pendingThinking = false
      textBuffer += event.text
      continue
    }

    if (event.type === "user_message") {
      flushText()
      flushExec()
      pendingThinking = false
      blocks.push({ kind: "user_message", content: event.content })
      continue
    }

    if (event.type === "user_exec") {
      flushText()
      flushExec()
      pendingThinking = false
      currentExec = {
        kind: "exec_session",
        command: event.command,
        output: "",
        isRunning: true,
      }
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

    // status_change should not flush currentExec — it can arrive mid-exec
    if (event.type === "status_change") {
      flushText()
      blocks.push({
        kind: "status_change",
        status: event.container_status ?? event.task_status ?? "",
      })
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
    }
  }

  flushText()
  flushExec()

  if (pendingThinking) {
    blocks.push({ kind: "thinking" })
  }

  return blocks
}

export function ChatStream({
  events,
  centered,
  bottomInset,
}: {
  events: Array<BoxStreamEvent>
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
        <div
          className={`flex flex-col gap-4 py-6 text-sm ${bottomInset ? "pb-32" : ""}`}
        >
          {blocks.map((block, i) => (
            <div
              key={i}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <ChatBlock block={block} />
            </div>
          ))}
          {events.length === 0 && (
            <div className="relative flex flex-col items-center justify-center py-16 text-center">
              <div className="font-terminal text-lg text-ghost">
                &gt; awaiting instructions
                <span className="animate-cursor">_</span>
              </div>
              <p className="mt-2 font-terminal text-xs text-ghost/50">
                Send a message to start the agent
              </p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </ScrollArea>
  )
}
