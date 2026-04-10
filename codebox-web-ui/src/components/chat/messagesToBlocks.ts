/**
 * Convert structured BoxMessage history into EventBlocks for rendering.
 *
 * This handles the "completed turns" side of the dual-source architecture.
 * Messages come from GET /api/boxes/{box_id}/messages (the source of truth),
 * while live/in-progress events come from the SSE stream.
 */

import type { BoxMessage } from "@/net/http/types"
import type { EventBlock } from "./types"

export function messagesToBlocks(
  messages: Array<BoxMessage> | undefined | null
): Array<EventBlock> {
  if (!messages || !Array.isArray(messages)) return []
  const blocks: Array<EventBlock> = []

  // Track pending tool calls so we can pair them with tool results
  // key: tool_call_id, value: index in blocks array
  const pendingToolCalls = new Map<string, number>()

  // Track the last exec_session block index for pairing with shell output
  let lastExecBlockIdx = -1

  for (const msg of messages) {
    let meta: Record<string, unknown> | null = null
    if (msg.metadata_json) {
      try {
        meta = JSON.parse(msg.metadata_json)
      } catch {
        // ignore malformed metadata
      }
    }

    // ── User messages ──
    if (msg.role === "user") {
      if (meta?.type === "shell_command") {
        // User-initiated shell command — start exec_session block
        const command = (msg.content ?? "").replace(/^! /, "")
        blocks.push({
          kind: "exec_session",
          command,
          output: "",
          isRunning: false,
        })
        lastExecBlockIdx = blocks.length - 1
      } else {
        blocks.push({ kind: "user_message", content: msg.content ?? "" })
      }
      continue
    }

    // ── System messages (shell output, internal) ──
    if (msg.role === "system") {
      if (meta?.type === "shell_output" && lastExecBlockIdx >= 0) {
        const execBlock = blocks[lastExecBlockIdx]
        if (execBlock.kind === "exec_session") {
          execBlock.output = msg.content ?? ""
          const exitCode = meta.exit_code
          if (exitCode != null) {
            execBlock.exitCode = String(exitCode)
          }
        }
      }
      // Skip other system messages (internal)
      continue
    }

    // ── Assistant messages ──
    if (msg.role === "assistant") {
      // Text content
      if (msg.content) {
        blocks.push({ kind: "text", content: msg.content })
      }

      // Tool calls — create a tool_call block for each
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          const blockIdx = blocks.length
          blocks.push({
            kind: "tool_call",
            name: tc.name,
            toolCallId: tc.id,
            input: tc.args_json,
            isRunning: false,
          })
          pendingToolCalls.set(tc.id, blockIdx)
        }
      }
      continue
    }

    // ── Tool result messages ──
    if (msg.role === "tool") {
      const tcId = msg.tool_call_id ?? ""
      const blockIdx = pendingToolCalls.get(tcId)
      if (blockIdx != null) {
        const toolBlock = blocks[blockIdx]
        if (toolBlock.kind === "tool_call") {
          toolBlock.output = msg.content ?? ""
        }
        pendingToolCalls.delete(tcId)
      } else {
        // Orphaned tool result — create standalone block
        blocks.push({
          kind: "tool_call",
          name: msg.tool_name ?? "tool",
          output: msg.content ?? "",
          isRunning: false,
        })
      }
      continue
    }
  }

  return blocks
}
