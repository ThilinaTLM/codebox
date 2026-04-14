import { useEffect, useRef } from "react"
import { ChatBlock } from "./ChatBlock"
import type { EventBlock } from "./types"
import type { BoxStreamEvent } from "@/net/http/types"
import { ScrollArea } from "@/components/ui/scroll-area"

function findToolBlock(
  blocks: Array<EventBlock>,
  toolCallId: string,
  fallbackName?: string
): Extract<EventBlock, { kind: "tool_call" }> | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (block.kind !== "tool_call") continue
    if (toolCallId && block.toolCallId === toolCallId) return block
    if (!toolCallId && fallbackName && block.name === fallbackName && block.isRunning) {
      return block
    }
  }
  return null
}

export function collapseTokens(events: Array<BoxStreamEvent>): Array<EventBlock> {
  const blocks: Array<EventBlock> = []
  let textBuffer = ""
  let thinkingBuffer = ""
  let reasoningActive = false
  let currentExec: Extract<EventBlock, { kind: "exec_session" }> | null = null

  const flushText = () => {
    if (textBuffer) {
      blocks.push({ kind: "text", content: textBuffer })
      textBuffer = ""
    }
  }

  const flushThinking = () => {
    if (thinkingBuffer || reasoningActive) {
      blocks.push({
        kind: "thinking",
        content: thinkingBuffer || undefined,
        isStreaming: reasoningActive,
      })
      thinkingBuffer = ""
    }
  }

  const flushExec = () => {
    if (currentExec) {
      blocks.push(currentExec)
      currentExec = null
    }
  }

  for (const event of events) {
    const payload = event.payload

    switch (event.kind) {
      case "reasoning.started":
        flushText()
        flushExec()
        reasoningActive = true
        break

      case "reasoning.delta":
        flushText()
        flushExec()
        thinkingBuffer += String(payload.text ?? "")
        break

      case "reasoning.completed":
        reasoningActive = false
        flushThinking()
        break

      case "message.delta":
        flushThinking()
        flushExec()
        textBuffer += String(payload.text ?? "")
        break

      case "message.completed": {
        const role = String(payload.role ?? "assistant")
        const content = String(payload.content ?? "")
        if (role === "user") {
          flushText()
          flushThinking()
          flushExec()
          blocks.push({ kind: "user_message", content })
          break
        }
        if (role === "assistant") {
          flushThinking()
          flushExec()
          if (!textBuffer && content) {
            blocks.push({ kind: "text", content })
          } else {
            flushText()
          }
        }
        break
      }

      case "tool_call.started": {
        flushText()
        flushThinking()
        flushExec()
        const name = String(payload.name ?? "tool")
        const existing = findToolBlock(blocks, event.tool_call_id, name)
        if (!existing) {
          blocks.push({
            kind: "tool_call",
            name,
            toolCallId: event.tool_call_id || undefined,
            isRunning: true,
          })
        }
        break
      }

      case "tool_call.arguments.delta": {
        const block = findToolBlock(blocks, event.tool_call_id)
        if (block) {
          block.input = (block.input ?? "") + String(payload.text ?? "")
        }
        break
      }

      case "tool_call.arguments.completed": {
        const block = findToolBlock(blocks, event.tool_call_id)
        if (block) {
          block.input = String(payload.arguments_json ?? "")
        }
        break
      }

      case "command.started": {
        const origin = String(payload.origin ?? "")
        const command = String(payload.command ?? "")
        if (origin === "user_exec") {
          flushText()
          flushThinking()
          flushExec()
          currentExec = { kind: "exec_session", command, output: "", isRunning: true }
        } else {
          const block = findToolBlock(blocks, event.tool_call_id, "execute")
          if (block && command && !block.input) {
            block.input = JSON.stringify({ command })
          }
        }
        break
      }

      case "command.output.delta": {
        const text = String(payload.text ?? "")
        if (event.tool_call_id) {
          const block = findToolBlock(blocks, event.tool_call_id, "execute")
          if (block) {
            block.streamOutput = (block.streamOutput ?? "") + text
          }
        } else {
          if (!currentExec) {
            currentExec = { kind: "exec_session", output: "", isRunning: true }
          }
          currentExec.output += text
        }
        break
      }

      case "command.completed":
      case "command.failed": {
        const origin = String(payload.origin ?? "")
        const output = String(payload.output ?? "")
        const exitCode = String(payload.exit_code ?? "")
        if (origin === "user_exec") {
          if (!currentExec) {
            currentExec = { kind: "exec_session", output: "", isRunning: false }
          }
          currentExec.output = output || currentExec.output
          currentExec.exitCode = exitCode
          currentExec.isRunning = false
          flushExec()
        } else {
          const block = findToolBlock(blocks, event.tool_call_id, "execute")
          if (block) {
            block.output = output
            block.isRunning = false
          }
        }
        break
      }

      case "tool_call.completed":
      case "tool_call.failed": {
        flushText()
        flushThinking()
        const block = findToolBlock(blocks, event.tool_call_id, String(payload.name ?? "tool"))
        if (block) {
          block.output = String(payload.output ?? "")
          block.isRunning = false
        } else {
          blocks.push({
            kind: "tool_call",
            name: String(payload.name ?? "tool"),
            toolCallId: event.tool_call_id || undefined,
            output: String(payload.output ?? ""),
            isRunning: false,
          })
        }
        break
      }

      case "run.started":
        flushText()
        flushThinking()
        flushExec()
        // No visual divider — keeps the chat clean
        break

      case "run.cancelled":
        flushText()
        flushThinking()
        flushExec()
        blocks.push({ kind: "status_change", status: "Cancelled" })
        break

      case "run.completed":
        flushText()
        flushThinking()
        flushExec()
        // No visual divider — the assistant response is sufficient signal
        break

      case "run.failed":
        flushText()
        flushThinking()
        flushExec()
        blocks.push({ kind: "error", detail: String(payload.error ?? "Run failed") })
        break

      case "outcome.declared":
        flushText()
        flushThinking()
        flushExec()
        // No banner — the assistant's reply already communicates the outcome
        break

      case "input.requested":
        flushText()
        flushThinking()
        flushExec()
        blocks.push({
          kind: "input_requested",
          message: String(payload.message ?? ""),
          questions: Array.isArray(payload.questions)
            ? (payload.questions as Array<string>)
            : undefined,
        })
        break

      default:
        break
    }
  }

  flushText()
  flushThinking()
  flushExec()
  return blocks
}

/**
 * Returns true when the last block already shows in-progress activity,
 * so we don't need an extra "Thinking…" spinner.
 */
function _hasActiveBlock(blocks: Array<EventBlock>): boolean {
  if (blocks.length === 0) return false
  const last = blocks[blocks.length - 1]
  if (last.kind === "thinking" && last.isStreaming) return true
  if (last.kind === "tool_call" && last.isRunning) return true
  if (last.kind === "exec_session" && last.isRunning) return true
  return false
}

function blockKey(block: EventBlock, index: number): string {
  if (block.kind === "tool_call" && block.toolCallId) {
    return `tc-${block.toolCallId}`
  }
  return `${block.kind}-${index}`
}

export function ChatStream({
  blocks,
  centered,
  isWorking,
  onSendMessage,
}: {
  blocks: Array<EventBlock>
  centered?: boolean
  isWorking?: boolean
  onSendMessage?: (text: string) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(0)

  useEffect(() => {
    if (blocks.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
    prevLenRef.current = blocks.length
  }, [blocks.length])

  return (
    <ScrollArea className="h-full">
      <div className={centered ? "mx-auto max-w-4xl px-4" : "px-5"}>
        <div className="flex flex-col gap-3 py-3 text-sm">
          {blocks.map((block, i) => (
            <div key={blockKey(block, i)}>
              <ChatBlock block={block} onSendMessage={onSendMessage} />
            </div>
          ))}
          {isWorking && !_hasActiveBlock(blocks) && (
            <div key="__working">
              <ChatBlock block={{ kind: "thinking", isStreaming: true }} onSendMessage={onSendMessage} />
            </div>
          )}
          {blocks.length === 0 && !isWorking && (
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
