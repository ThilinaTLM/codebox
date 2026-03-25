import { useCallback, useEffect, useRef, useState } from "react"
import type { WSEvent } from "@/net/http/types"
import { WS_URL } from "@/lib/constants"

export { useGlobalWebSocket } from "./useGlobalWebSocket"

interface UseBoxWebSocketOptions {
  boxId: string | undefined
  enabled?: boolean
}

interface UseBoxWebSocketReturn {
  events: WSEvent[]
  sendMessage: (content: string) => void
  sendExec: (command: string) => void
  sendCancel: () => void
  isConnected: boolean
}

export function useBoxWebSocket({
  boxId,
  enabled = true,
}: UseBoxWebSocketOptions): UseBoxWebSocketReturn {
  const [events, setEvents] = useState<WSEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const activeRef = useRef(false)

  const connect = useCallback(() => {
    if (!boxId || !enabled || !activeRef.current) return

    const url = `${WS_URL}/api/boxes/${boxId}/ws`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
    }

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WSEvent
        if (event.type === "ping") return
        // Reset backoff on real message (not just on open, to avoid
        // open-then-immediate-close resetting the counter)
        reconnectAttemptsRef.current = 0
        setEvents((prev) => [...prev, event])
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = (e) => {
      setIsConnected(false)
      wsRef.current = null

      // Don't reconnect if the effect was cleaned up, or if the server
      // told us the box doesn't exist (close code 4004).
      if (!activeRef.current || e.code === 4004) return

      if (enabled) {
        const delay = Math.min(
          1000 * 2 ** reconnectAttemptsRef.current,
          30000,
        )
        reconnectAttemptsRef.current += 1
        reconnectTimeoutRef.current = setTimeout(connect, delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [boxId, enabled])

  useEffect(() => {
    activeRef.current = true
    setEvents([])
    reconnectAttemptsRef.current = 0

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    connect()

    return () => {
      activeRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", content }))
    }
  }, [])

  const sendExec = useCallback((command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "exec", content: command }))
    }
  }, [])

  const sendCancel = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cancel" }))
    }
  }, [])

  return { events, sendMessage, sendExec, sendCancel, isConnected }
}
