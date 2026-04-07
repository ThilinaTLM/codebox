/**
 * Consolidated chat state hook.
 *
 * Merges two data sources into a single `blocks` array:
 *   1. History  — BoxMessage[] from react-query (GET /api/boxes/:id/messages)
 *   2. Live SSE — BoxStreamEvent[] from EventSource (/api/boxes/:id/stream)
 *
 * The handoff between "live turn in progress" and "turn absorbed into history"
 * is handled at render-time via a drain-phase check, eliminating the race
 * condition that previously caused duplicate blocks.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { BoxMessage, BoxStreamEvent } from "@/net/http/types"
import type { EventBlock } from "@/components/chat/types"
import { messagesToBlocks } from "@/components/chat/messagesToBlocks"
import { collapseTokens } from "@/components/chat/ChatStream"
import { useBoxMessages } from "@/net/query"
import { API_URL } from "@/lib/constants"

// ── SSE reconnection config ─────────────────────────────────

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

// ── Public interface ─────────────────────────────────────────

interface UseChatStateOptions {
  boxId: string
  enabled?: boolean
}

interface UseChatStateReturn {
  /** Merged, deduplicated blocks ready for rendering. */
  blocks: Array<EventBlock>
  /** Raw live SSE events for the current turn (used by useAgentActivity). */
  liveEvents: Array<BoxStreamEvent>
  /** Whether the SSE connection is open. */
  isConnected: boolean
}

// ── Hook ─────────────────────────────────────────────────────

const EMPTY_EVENTS: Array<BoxStreamEvent> = []

export function useChatState({
  boxId,
  enabled = true,
}: UseChatStateOptions): UseChatStateReturn {
  const queryClient = useQueryClient()

  // ── History (react-query) ──
  const {
    data: messages = [] as Array<BoxMessage>,
    dataUpdatedAt,
  } = useBoxMessages(boxId)

  // ── Live SSE events ──
  const [liveEvents, setLiveEvents] = useState<Array<BoxStreamEvent>>([])
  const [isConnected, setIsConnected] = useState(false)

  // ── Drain phase ──
  // When a turn completes (done/error), we enter drain mode.
  // `drainRequestedAt` records the timestamp so we can detect when
  // the messages query has been refreshed *after* the drain started.
  const [drainRequestedAt, setDrainRequestedAt] = useState<number | null>(null)

  // Keep a ref to queryClient & boxId for the SSE handler closure
  // so the EventSource doesn't need to be torn down on every render.
  const qcRef = useRef(queryClient)
  qcRef.current = queryClient
  const boxIdRef = useRef(boxId)
  boxIdRef.current = boxId

  // ── SSE connection with reconnection ──
  useEffect(() => {
    if (!boxId || !enabled) return

    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    let disposed = false

    function connect() {
      if (disposed) return

      const url = `${API_URL}/api/boxes/${boxIdRef.current}/stream`
      es = new EventSource(url)

      es.onopen = () => {
        setIsConnected(true)
        if (attempt > 0) {
          // Reconnected — refetch messages to cover any gap
          qcRef.current.invalidateQueries({
            queryKey: ["boxes", boxIdRef.current, "messages"],
          })
        }
        attempt = 0
      }

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as BoxStreamEvent
          setLiveEvents((prev) => [...prev, event])

          // When a turn completes, start draining
          if (event.type === "done" || event.type === "error") {
            setDrainRequestedAt(Date.now())
            qcRef.current.invalidateQueries({
              queryKey: ["boxes", boxIdRef.current, "messages"],
            })
          }
        } catch {
          // ignore malformed SSE payloads
        }
      }

      es.onerror = () => {
        setIsConnected(false)
        if (es) {
          es.close()
          es = null
        }
        if (disposed) return

        // Reconnect with exponential backoff
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** attempt,
          RECONNECT_MAX_MS,
        )
        reconnectTimer = setTimeout(() => {
          attempt++
          connect()
        }, delay)
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (es) {
        es.close()
        es = null
      }
      setIsConnected(false)
      setLiveEvents([])
      setDrainRequestedAt(null)
    }
  }, [boxId, enabled])

  // ── Post-render cleanup: clear events once history has caught up ──
  useEffect(() => {
    if (drainRequestedAt !== null && dataUpdatedAt > drainRequestedAt) {
      setLiveEvents([])
      setDrainRequestedAt(null)
    }
  }, [drainRequestedAt, dataUpdatedAt])

  // ── Merged blocks (render-time deduplication) ──
  const historyBlocks = useMemo(() => messagesToBlocks(messages), [messages])

  const blocks = useMemo(() => {
    // If we're draining AND history has been refreshed since the drain
    // started, the live turn is already in history — skip live blocks.
    // This check runs at render time, so there is never a frame where
    // both sources contribute the same content.
    if (drainRequestedAt !== null && dataUpdatedAt > drainRequestedAt) {
      return historyBlocks
    }

    // Normal case: history (completed turns) + live (current turn)
    if (liveEvents.length === 0) return historyBlocks
    const liveBlocks = collapseTokens(liveEvents)
    return [...historyBlocks, ...liveBlocks]
  }, [historyBlocks, liveEvents, drainRequestedAt, dataUpdatedAt])

  return {
    blocks,
    liveEvents: drainRequestedAt !== null && dataUpdatedAt > drainRequestedAt
      ? EMPTY_EVENTS
      : liveEvents,
    isConnected,
  }
}
