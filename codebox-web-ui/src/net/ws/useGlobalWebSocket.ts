import { useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { WS_URL } from "@/lib/constants"
import type { Box, GlobalWSEvent } from "@/net/http/types"

export function useGlobalWebSocket() {
  const qc = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const activeRef = useRef(false)
  const qcRef = useRef(qc)
  qcRef.current = qc

  const connect = useCallback(() => {
    if (!activeRef.current) return

    const url = `${WS_URL}/api/ws`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      // Invalidate all box queries on reconnect to sync any missed events
      if (reconnectAttemptsRef.current > 0) {
        qcRef.current.invalidateQueries({ queryKey: ["boxes"] })
      }
      reconnectAttemptsRef.current = 0
    }

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as GlobalWSEvent
        if (event.type === "ping") return

        if (event.type === "box_created") {
          qcRef.current.invalidateQueries({ queryKey: ["boxes"] })
        }

        if (event.type === "box_status_changed") {
          qcRef.current.setQueriesData<Box>(
            { queryKey: ["boxes", event.box_id] },
            (old) =>
              old ? { ...old, status: event.status as Box["status"] } : old,
          )
          qcRef.current.invalidateQueries({ queryKey: ["boxes"] })
        }

        if (event.type === "box_deleted") {
          qcRef.current.removeQueries({ queryKey: ["boxes", event.box_id] })
          qcRef.current.invalidateQueries({ queryKey: ["boxes"] })
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      if (!activeRef.current) return

      const delay = Math.min(
        1000 * 2 ** reconnectAttemptsRef.current,
        30000,
      )
      reconnectAttemptsRef.current += 1
      reconnectTimeoutRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    activeRef.current = true
    reconnectAttemptsRef.current = 0
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
}
