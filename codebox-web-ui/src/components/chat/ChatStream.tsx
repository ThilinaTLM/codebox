import { useEffect, useMemo, useRef } from "react"
import { ChatBlock } from "./ChatBlock"
import { messagesToBlocks } from "./messagesToBlocks"
import type { EventBlock } from "./types"
import type { BoxMessage, BoxStreamEvent } from "@/net/http/types"
import { ScrollArea } from "@/components/ui/scroll-area"

export function collapseTokens(events: Array<BoxStreamEvent>): Array<EventBlock> {
  const blocks: Array<EventBlock> = []
  let textBuffer = ""
  let pendingThinking = false
  let thinkingBuffer = ""
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

  const flushThinking = () => {
    if (thinkingBuffer) {
      blocks.push({ kind: "thinking", content: thinkingBuffer })
      thinkingBuffer = ""
      pendingThinking = false
    }
  }

  for (const event of events) {
    if (event.type === "message_complete") continue

    if (event.type === "token") {
      flushExec()
      flushThinking()
      pendingThinking = false
      textBuffer += event.text
      continue
    }

    if (event.type === "thinking_token") {
      flushText()
      flushExec()
      pendingThinking = false
      thinkingBuffer += event.text
      continue
    }

    if (event.type === "user_message") {
      flushText()
      flushExec()
      flushThinking()
      pendingThinking = false
      blocks.push({ kind: "user_message", content: event.content })
      continue
    }

    if (event.type === "user_exec") {
      flushText()
      flushExec()
      flushThinking()
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
      flushThinking()
      pendingThinking = false
      if (!currentExec) {
        currentExec = { kind: "exec_session", output: "", isRunning: true }
      }
      currentExec.output += event.output
      continue
    }

    if (event.type === "exec_done") {
      flushText()
      flushThinking()
      pendingThinking = false
      if (!currentExec) {
        currentExec = { kind: "exec_session", output: "", isRunning: false }
      }
      currentExec.exitCode = event.output
      currentExec.isRunning = false
      flushExec()
      continue
    }

    // Streaming exec output from agent tool calls
    if (event.type === "tool_exec_output") {
      for (let j = blocks.length - 1; j >= 0; j--) {
        const b = blocks[j]
        if (
          b.kind === "tool_call" &&
          b.isRunning &&
          (b.toolCallId === event.tool_call_id || b.name === "execute")
        ) {
          b.streamOutput = (b.streamOutput || "") + event.output
          break
        }
      }
      continue
    }

    // These events should not flush currentExec — they can arrive mid-exec
    if (
      event.type === "status_change" ||
      event.type === "activity_changed" ||
      event.type === "task_outcome"
    ) {
      flushText()
      if (event.type === "status_change") {
        blocks.push({
          kind: "status_change",
          status: event.container_status ?? event.activity ?? "",
        })
      }
      continue
    }

    flushText()
    flushExec()
    flushThinking()

    switch (event.type) {
      case "model_start":
        pendingThinking = true
        break

      case "tool_start": {
        pendingThinking = false
        // If a block with the same toolCallId already exists, update its input
        // (second tool_start carries the full args from the updates stream)
        let existingIdx = -1
        if (event.tool_call_id) {
          for (let j = blocks.length - 1; j >= 0; j--) {
            const b = blocks[j]
            if (b.kind === "tool_call" && b.toolCallId === event.tool_call_id) {
              existingIdx = j
              break
            }
          }
        }
        if (existingIdx >= 0) {
          const existing = blocks[existingIdx]
          if (existing.kind === "tool_call") {
            existing.input = event.input
          }
        } else {
          blocks.push({
            kind: "tool_call",
            name: event.name,
            toolCallId: event.tool_call_id,
            input: event.input,
            isRunning: true,
          })
        }
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
  flushThinking()

  if (pendingThinking) {
    blocks.push({ kind: "thinking" })
  }

  return blocks
}

export function ChatStream({
  messages,
  liveEvents,
  centered,
  bottomInset,
}: {
  messages: Array<BoxMessage>
  liveEvents: Array<BoxStreamEvent>
  centered?: boolean
  bottomInset?: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, liveEvents.length])

  // Completed turns from REST history
  const historyBlocks = useMemo(() => messagesToBlocks(messages), [messages])
  // Current in-progress turn from SSE
  const liveBlocks = collapseTokens(liveEvents)
  const blocks = [...historyBlocks, ...liveBlocks]
  const isEmpty = messages.length === 0 && liveEvents.length === 0

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
          {isEmpty && (
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
