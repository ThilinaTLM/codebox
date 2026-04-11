import { useEffect, useMemo, useState } from "react"
import {
  EventStreamContentType,
  fetchEventSource,
} from "@microsoft/fetch-event-source"
import type { BoxStreamEvent } from "@/net/http/types"
import type { EventBlock } from "@/components/chat/types"
import { collapseTokens } from "@/components/chat/ChatStream"
import { useBoxEvents } from "@/net/query"
import { API_URL } from "@/lib/constants"
import { useAuthStore } from "@/lib/auth"

interface UseChatStateOptions {
  boxId: string
  enabled?: boolean
}

interface UseChatStateReturn {
  blocks: Array<EventBlock>
  liveEvents: Array<BoxStreamEvent>
  isConnected: boolean
}

export function useChatState({
  boxId,
  enabled = true,
}: UseChatStateOptions): UseChatStateReturn {
  const token = useAuthStore((s) => s.token)
  const { data } = useBoxEvents(boxId, { enabled })
  const historyEvents = data ?? []
  const [liveEvents, setLiveEvents] = useState<Array<BoxStreamEvent>>([])
  const [isConnected, setIsConnected] = useState(false)

  const lastHistorySeq = historyEvents.length
    ? historyEvents[historyEvents.length - 1]?.seq ?? 0
    : 0

  useEffect(() => {
    if (!boxId || !enabled || !token) return

    const ctrl = new AbortController()
    const url = `${API_URL}/api/boxes/${boxId}/stream?after_seq=${lastHistorySeq}`

    fetchEventSource(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
      // eslint-disable-next-line @typescript-eslint/require-await
      async onopen(response) {
        if (
          response.ok &&
          response.headers.get("content-type")?.includes(EventStreamContentType)
        ) {
          setIsConnected(true)
          return
        }

        if (response.status === 401) {
          useAuthStore.getState().logout()
          ctrl.abort()
        }

        throw new Error(`SSE open failed: ${response.status}`)
      },
      onmessage(ev) {
        try {
          const event = JSON.parse(ev.data) as BoxStreamEvent
          setLiveEvents((prev) => {
            if (prev.some((existing) => existing.seq === event.seq)) {
              return prev
            }
            return [...prev, event]
          })
        } catch {
          // ignore malformed payloads
        }
      },
      onerror() {
        setIsConnected(false)
        if (ctrl.signal.aborted) return
        return undefined
      },
      openWhenHidden: true,
    })

    return () => {
      ctrl.abort()
      setIsConnected(false)
      setLiveEvents([])
    }
  }, [boxId, enabled, token, lastHistorySeq])

  const blocks = useMemo(() => {
    const merged = [...historyEvents, ...liveEvents]
      .sort((a, b) => a.seq - b.seq)
      .filter((event, index, arr) => index === 0 || arr[index - 1]?.seq !== event.seq)
    return collapseTokens(merged)
  }, [historyEvents, liveEvents])

  return { blocks, liveEvents, isConnected }
}
