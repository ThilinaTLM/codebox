import { useEffect, useRef } from "react"
import { ChatBlock } from "./ChatBlock"
import type { EventBlock } from "./types"
import type { BoxStreamEvent } from "@/net/http/types"
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

    // user_message and user_exec are already persisted to box_messages
    // and rendered from history — skip them in the live stream to avoid duplicates
    if (event.type === "user_message" || event.type === "user_exec") {
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

/**
 * Derive a stable React key for a block.
 *
 * Uses toolCallId when available (tool_call blocks), falls back to
 * kind + index which is stable as long as the block list doesn't
 * get reordered (it never does — both sources are append-only).
 */
function blockKey(block: EventBlock, index: number): string {
  if (block.kind === "tool_call" && block.toolCallId) {
    return `tc-${block.toolCallId}`
  }
  return `${block.kind}-${index}`
}

export function ChatStream({
  blocks,
  centered,
  bottomInset,
}: {
  blocks: Array<EventBlock>
  centered?: boolean
  bottomInset?: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(0)

  useEffect(() => {
    // Only auto-scroll when new blocks are appended
    if (blocks.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
    prevLenRef.current = blocks.length
  }, [blocks.length])

  return (
    <ScrollArea className="h-full">
      <div className={centered ? "mx-auto max-w-4xl px-4" : "px-5"}>
        <div
          className={`flex flex-col gap-1.5 py-3 text-sm ${bottomInset ? "pb-28" : ""}`}
        >
          {blocks.map((block, i) => (
            <div key={blockKey(block, i)}>
              <ChatBlock block={block} />
            </div>
          ))}
          {blocks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
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
