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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const qcRef = useRef(qc)
  qcRef.current = qc
  const hadConnectionRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      hadConnectionRef.current = false
      return
    }

    const ctrl = new AbortController()
    const url = `${API_URL}/api/stream`

    fetchEventSource(url, {
      credentials: "include",
      signal: ctrl.signal,

      async onopen(response) {
        if (
          response.ok &&
          response.headers.get("content-type")?.includes(EventStreamContentType)
        ) {
          if (hadConnectionRef.current) {
            qcRef.current.invalidateQueries({ queryKey: ["boxes"], exact: true })
          }
          hadConnectionRef.current = true
          return
        }

        if (response.status === 401) {
          useAuthStore.getState().logout()
          ctrl.abort()
        }

        throw new Error(`Global SSE open failed: ${response.status}`)
      },

      onmessage(ev) {
        try {
          const event = JSON.parse(ev.data)
          if (!event.type) return

          if (event.type === "box_created") {
            qcRef.current.invalidateQueries({ queryKey: ["boxes"], exact: true })
          }

          if (event.type === "box_status_changed") {
            qcRef.current.setQueriesData<Box>(
              { queryKey: ["boxes", event.box_id], exact: true },
              (old) => {
                if (!old) return old
                const updates: Partial<Box> = {}
                if (event.container_status)
                  updates.container_status = event.container_status
                if (event.activity) updates.activity = event.activity
                if (event.box_outcome)
                  updates.box_outcome = event.box_outcome
                if (event.box_outcome_message)
                  updates.box_outcome_message = event.box_outcome_message
                if (event.error_detail)
                  updates.error_detail = event.error_detail
                if (event.grpc_connected !== undefined)
                  updates.grpc_connected = event.grpc_connected as boolean
                return { ...old, ...updates }
              }
            )
            qcRef.current.invalidateQueries({ queryKey: ["boxes"], exact: true })
          }

          if (event.type === "box_deleted") {
            qcRef.current.removeQueries({
              queryKey: ["boxes", event.box_id],
            })
            qcRef.current.invalidateQueries({ queryKey: ["boxes"], exact: true })
          }
        } catch {
          // ignore malformed messages
        }
      },

      onerror() {
        if (ctrl.signal.aborted) return
        return undefined
      },

      openWhenHidden: true,
    })

    return () => {
      ctrl.abort()
      hadConnectionRef.current = false
    }
  }, [isAuthenticated])
}
