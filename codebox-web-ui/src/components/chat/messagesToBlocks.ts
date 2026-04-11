import type { EventBlock } from "./types"

// Legacy placeholder kept to avoid stale imports during the event-stream cutover.
// The live UI now renders directly from canonical events via useChatState + collapseTokens.
export function messagesToBlocks(): Array<EventBlock> {
  return []
}
