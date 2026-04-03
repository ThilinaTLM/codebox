import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { Box } from "@/net/http/types"
import { API_URL } from "@/lib/constants"

export function useGlobalStream() {
  const qc = useQueryClient()
  const esRef = useRef<EventSource | null>(null)
  const activeRef = useRef(false)
  const qcRef = useRef(qc)
  qcRef.current = qc
  const hadConnectionRef = useRef(false)

  useEffect(() => {
    activeRef.current = true

    const url = `${API_URL}/api/stream`
    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      // Invalidate all box queries on reconnect to sync any missed events
      if (hadConnectionRef.current) {
        qcRef.current.invalidateQueries({ queryKey: ["boxes"] })
      }
      hadConnectionRef.current = true
    }

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
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
              if (event.activity)
                updates.activity = event.activity
              if (event.task_outcome)
                updates.task_outcome = event.task_outcome
              return { ...old, ...updates }
            }
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

    return () => {
      activeRef.current = false
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [])
}
