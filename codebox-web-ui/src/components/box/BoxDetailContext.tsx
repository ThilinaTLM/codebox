import { createContext, useContext } from "react"
import type { Box, BoxStreamEvent } from "@/net/http/types"
import type { AgentActivity } from "@/hooks/useAgentActivity"
import type { useBoxActions } from "@/hooks/useBoxActions"

export interface BoxDetailContextValue {
  box: Box
  boxId: string
  projectSlug: string
  isActive: boolean
  isStopped: boolean
  activity: AgentActivity
  elapsed: string | null
  actions: ReturnType<typeof useBoxActions>
  isConnected: boolean
  liveEvents: Array<BoxStreamEvent>
}

const BoxDetailContext = createContext<BoxDetailContextValue | null>(null)

export function useBoxDetail(): BoxDetailContextValue {
  const ctx = useContext(BoxDetailContext)
  if (!ctx) {
    throw new Error("useBoxDetail must be used within a BoxDetailProvider")
  }
  return ctx
}

export { BoxDetailContext }
