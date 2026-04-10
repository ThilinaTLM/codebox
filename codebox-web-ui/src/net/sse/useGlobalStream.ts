import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  EventStreamContentType,
  fetchEventSource,
} from "@microsoft/fetch-event-source"
import type { Box } from "@/net/http/types"
import { API_URL } from "@/lib/constants"
import { useAuthStore } from "@/lib/auth"

export function useGlobalStream() {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const qcRef = useRef(qc)
  qcRef.current = qc
  const hadConnectionRef = useRef(false)

  useEffect(() => {
    if (!token) return

    const ctrl = new AbortController()
    const url = `${API_URL}/api/stream`

    fetchEventSource(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,

      // eslint-disable-next-line @typescript-eslint/require-await
      async onopen(response) {
        if (
          response.ok &&
          response.headers.get("content-type")?.includes(EventStreamContentType)
        ) {
          // Invalidate all box queries on reconnect to sync any missed events
          if (hadConnectionRef.current) {
            qcRef.current.invalidateQueries({ queryKey: ["boxes"] })
          }
          hadConnectionRef.current = true
          return
        }
        throw new Error(`Global SSE open failed: ${response.status}`)
      },

      onmessage(ev) {
        try {
          const event = JSON.parse(ev.data)
          if (!event.type) return

          if (event.type === "box_created") {
            qcRef.current.invalidateQueries({ queryKey: ["boxes"] })
          }

          if (event.type === "box_status_changed") {
            qcRef.current.setQueriesData<Box>(
              { queryKey: ["boxes", event.box_id] },
              (old) => {
                if (!old) return old
                const updates: Partial<Box> = {}
                if (event.container_status)
                  updates.container_status = event.container_status
                if (event.activity) updates.activity = event.activity
                if (event.task_outcome)
                  updates.task_outcome = event.task_outcome
                if (event.error_detail)
                  updates.error_detail = event.error_detail
                return { ...old, ...updates }
              }
            )
            qcRef.current.invalidateQueries({ queryKey: ["boxes"] })
          }

          if (event.type === "box_deleted") {
            qcRef.current.removeQueries({
              queryKey: ["boxes", event.box_id],
            })
            qcRef.current.invalidateQueries({ queryKey: ["boxes"] })
          }
        } catch {
          // ignore malformed messages
        }
      },

      onerror() {
        // Return undefined to let fetch-event-source use default retry
        return undefined
      },

      openWhenHidden: true,
    })

    return () => {
      ctrl.abort()
    }
  }, [token])
}
