import { useEffect, useRef } from "react"
import { ChatBlock } from "./ChatBlock"
import type { EventBlock } from "./types"
import { ScrollArea } from "@/components/ui/scroll-area"

// Re-export for backward compatibility
export { collapseTokens } from "@/lib/event-utils"

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
