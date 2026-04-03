import { useCallback, useEffect, useRef, useState } from "react"
import type { BoxStreamEvent } from "@/net/http/types"
import { API_URL } from "@/lib/constants"

interface UseBoxStreamOptions {
  boxId: string | undefined
  enabled?: boolean
}

interface UseBoxStreamReturn {
  events: Array<BoxStreamEvent>
  isConnected: boolean
  clearEvents: () => void
}

export function useBoxStream({
  boxId,
  enabled = true,
}: UseBoxStreamOptions): UseBoxStreamReturn {
  const [events, setEvents] = useState<Array<BoxStreamEvent>>([])
  const [isConnected, setIsConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const activeRef = useRef(false)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const clearEvents = useCallback(() => setEvents([]), [])

  const connect = useCallback(() => {
    if (!boxId || !enabledRef.current || !activeRef.current) return

    const url = `${API_URL}/api/boxes/${boxId}/stream`
    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      setIsConnected(true)
    }

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as BoxStreamEvent
        setEvents((prev) => [...prev, event])
      } catch {
        // ignore malformed messages
      }
    }

    es.onerror = () => {
      setIsConnected(false)
    }
  }, [boxId])

  useEffect(() => {
    activeRef.current = true

    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    if (enabled && boxId) {
      connect()
    }

    return () => {
      activeRef.current = false
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      setIsConnected(false)
    }
  }, [boxId, enabled, connect])

  return { events, isConnected, clearEvents }
}
