/**
 * Shared event-collapsing utilities.
 *
 * Converts a flat list of canonical SSE events into display-ready blocks
 * for chat, terminal, and other views.
 */

import type { BoxStreamEvent } from "@/net/http/types"
import type { EventBlock } from "@/components/chat/types"

// ── Helpers ─────────────────────────────────────────────────

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

// ── Chat blocks ─────────────────────────────────────────────

/**
 * Collapse a sorted stream of events into display blocks for the chat view.
 */
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

// ── Exec blocks (for terminal view) ─────────────────────────

export interface ExecBlock {
  command: string
  output: string
  exitCode?: string
  isRunning: boolean
}

/**
 * Filter and collapse events into user-exec command blocks for the terminal view.
 */
export function collapseExecEvents(events: Array<BoxStreamEvent>): Array<ExecBlock> {
  const blocks: Array<ExecBlock> = []
  let current: ExecBlock | null = null

  for (const event of events) {
    const payload = event.payload
    const origin = String(payload.origin ?? "")

    switch (event.kind) {
      case "command.started":
        if (origin === "user_exec") {
          if (current) blocks.push(current)
          current = {
            command: String(payload.command ?? ""),
            output: "",
            isRunning: true,
          }
        }
        break

      case "command.output.delta":
        // Only process if no tool_call_id (user exec events don't have one)
        if (!event.tool_call_id && current) {
          current.output += String(payload.text ?? "")
        }
        break

      case "command.completed":
      case "command.failed":
        if (origin === "user_exec" && current) {
          const output = String(payload.output ?? "")
          current.output = output || current.output
          current.exitCode = String(payload.exit_code ?? "")
          current.isRunning = false
          blocks.push(current)
          current = null
        }
        break
    }
  }

  if (current) blocks.push(current)
  return blocks
}

/**
 * Merge sorted event arrays, deduplicating by seq.
 */
export function mergeEvents(
  history: Array<BoxStreamEvent>,
  live: Array<BoxStreamEvent>
): Array<BoxStreamEvent> {
  return [...history, ...live]
    .sort((a, b) => a.seq - b.seq)
    .filter((event, index, arr) => index === 0 || arr[index - 1]?.seq !== event.seq)
}
