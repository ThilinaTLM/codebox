import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  EventStreamContentType,
  fetchEventSource,
} from "@microsoft/fetch-event-source"
import type { QueryClient } from "@tanstack/react-query"
import type { Box, Project } from "@/net/http/types"
import { API_URL } from "@/lib/constants"
import { useAuthStore } from "@/lib/auth"
import { useConnectionStore } from "@/lib/connection"
import { useProjectStore } from "@/lib/project"

/**
 * Invalidate every project-scoped box list query. Project slug is not part of
 * the canonical box event, so we use a predicate that matches any key shaped
 * like `["projects", <slug>, "boxes", ...]`.
 */
function invalidateAllProjectBoxLists(qc: QueryClient): void {
  qc.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey
      return (
        Array.isArray(key) &&
        key[0] === "projects" &&
        key[2] === "boxes"
      )
    },
  })
}

function findProjectSlug(qc: QueryClient, projectId?: string): string | undefined {
  if (!projectId) return undefined

  const projects = qc.getQueryData<Array<Project>>(["projects"])
  const fromList = projects?.find((p) => p.id === projectId)?.slug
  if (fromList) return fromList

  const projectQueries = qc.getQueryCache().findAll({
    predicate: (query) => {
      const key = query.queryKey
      return Array.isArray(key) && key[0] === "projects" && key.length === 2
    },
  })

  for (const query of projectQueries) {
    const data = query.state.data as Project | undefined
    if (data?.id === projectId) return data.slug
  }

  return undefined
}

function invalidateProjectBoxLists(qc: QueryClient, projectId?: string): void {
  const slug = findProjectSlug(qc, projectId)
  if (!slug) {
    invalidateAllProjectBoxLists(qc)
    return
  }
  qc.invalidateQueries({ queryKey: ["projects", slug, "boxes"] })
}

interface BoxStatusEvent {
  type: "box_status_changed"
  box_id: string
  project_id?: string
  container_status?: Box["container_status"]
  activity?: Box["activity"]
  box_outcome?: Box["box_outcome"]
  box_outcome_message?: string
  error_detail?: string
  grpc_connected?: boolean
}

function applyBoxStatusUpdate(qc: QueryClient, event: BoxStatusEvent): void {
  const slug = findProjectSlug(qc, event.project_id)
  qc.setQueriesData<Box>(
    {
      predicate: (query) => {
        const key = query.queryKey
        return (
          Array.isArray(key) &&
          key[0] === "projects" &&
          (!slug || key[1] === slug) &&
          key[2] === "boxes" &&
          key[3] === event.box_id &&
          key.length === 4
        )
      },
    },
    (old) => {
      if (!old) return old
      const updates: Partial<Box> = {}
      if (event.container_status)
        updates.container_status = event.container_status
      if (event.activity !== undefined) updates.activity = event.activity
      if (event.box_outcome) updates.box_outcome = event.box_outcome
      if (event.box_outcome_message)
        updates.box_outcome_message = event.box_outcome_message
      if (event.error_detail) updates.error_detail = event.error_detail
      if (event.grpc_connected !== undefined)
        updates.grpc_connected = event.grpc_connected
      return { ...old, ...updates }
    }
  )
  invalidateProjectBoxLists(qc, event.project_id)
}

function removeBoxFromCaches(
  qc: QueryClient,
  boxId: string,
  projectId?: string
): void {
  const slug = findProjectSlug(qc, projectId)
  qc.removeQueries({
    predicate: (query) => {
      const key = query.queryKey
      return (
        Array.isArray(key) &&
        key[0] === "projects" &&
        (!slug || key[1] === slug) &&
        key[2] === "boxes" &&
        key[3] === boxId
      )
    },
  })
  invalidateProjectBoxLists(qc, projectId)
}

function invalidateProjectKeys(qc: QueryClient, slug?: string): void {
  qc.invalidateQueries({ queryKey: ["projects"] })
  if (slug) {
    qc.invalidateQueries({ queryKey: ["projects", slug] })
  }
}

export function useGlobalStream() {
  const qc = useQueryClient()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const qcRef = useRef(qc)
  qcRef.current = qc
  const hadConnectionRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      hadConnectionRef.current = false
      useConnectionStore.getState().setGlobalStreamConnected(false)
      return
    }

    const ctrl = new AbortController()
    const url = `${API_URL}/api/stream`

    fetchEventSource(url, {
      credentials: "include",
      signal: ctrl.signal,

      // eslint-disable-next-line @typescript-eslint/require-await
      async onopen(response) {
        if (
          response.ok &&
          response.headers.get("content-type")?.includes(EventStreamContentType)
        ) {
          if (hadConnectionRef.current) {
            invalidateAllProjectBoxLists(qcRef.current)
          }
          hadConnectionRef.current = true
          useConnectionStore.getState().setGlobalStreamConnected(true)
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
          const event = JSON.parse(ev.data) as Record<string, unknown>
          if (typeof event.type !== "string") return

          const eventType = event.type

          if (eventType === "box_created" || eventType === "box_deleted") {
            const projectId =
              typeof event.project_id === "string" ? event.project_id : undefined
            if (eventType === "box_deleted" && typeof event.box_id === "string") {
              removeBoxFromCaches(qcRef.current, event.box_id, projectId)
            } else {
              invalidateProjectBoxLists(qcRef.current, projectId)
            }
            return
          }

          if (
            eventType === "box_status_changed" &&
            typeof event.box_id === "string"
          ) {
            applyBoxStatusUpdate(qcRef.current, event as unknown as BoxStatusEvent)
            return
          }

          if (
            eventType === "project_archived" ||
            eventType === "project_restored" ||
            eventType === "project_deleted"
          ) {
            const slug =
              typeof event.slug === "string" ? event.slug : undefined
            invalidateProjectKeys(qcRef.current, slug)

            if (eventType === "project_deleted" && slug) {
              const recent = useProjectStore.getState().recentProjectSlug
              if (recent === slug) {
                useProjectStore.getState().clearRecentProjectSlug()
              }
            }
            return
          }
        } catch {
          // ignore malformed messages
        }
      },

      onerror() {
        useConnectionStore.getState().setGlobalStreamConnected(false)
        if (ctrl.signal.aborted) return
        return undefined
      },

      openWhenHidden: true,
    })

    return () => {
      ctrl.abort()
      hadConnectionRef.current = false
      useConnectionStore.getState().setGlobalStreamConnected(false)
    }
  }, [isAuthenticated])
}
