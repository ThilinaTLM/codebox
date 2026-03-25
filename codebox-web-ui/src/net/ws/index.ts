import { useCallback, useEffect, useRef, useState } from "react"
import type { WSEvent } from "@/net/http/types"
import { WS_URL } from "@/lib/constants"

export function getWsUrl(taskId: string): string {
  return `${WS_URL}/api/tasks/${taskId}/ws`
}

interface UseTaskWebSocketOptions {
  taskId: string | undefined
  enabled?: boolean
}

interface UseTaskWebSocketReturn {
  events: WSEvent[]
  sendMessage: (content: string) => void
  sendCancel: () => void
  isConnected: boolean
}

export function useTaskWebSocket({
  taskId,
  enabled = true,
}: UseTaskWebSocketOptions): UseTaskWebSocketReturn {
  const [events, setEvents] = useState<WSEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isTerminalRef = useRef(false)

  const connect = useCallback(() => {
    if (!taskId || !enabled || isTerminalRef.current) return

    const url = getWsUrl(taskId)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      reconnectAttemptsRef.current = 0
    }

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WSEvent
        if (event.type === "ping") return

        setEvents((prev) => [...prev, event])

        if (event.type === "done" || event.type === "error") {
          isTerminalRef.current = true
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null

      // Reconnect with exponential backoff unless terminal
      if (!isTerminalRef.current && enabled) {
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
  }, [taskId, enabled])

  useEffect(() => {
    // Reset state when taskId changes
    setEvents([])
    isTerminalRef.current = false
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

  const sendCancel = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cancel" }))
    }
  }, [])

  return { events, sendMessage, sendCancel, isConnected }
}
