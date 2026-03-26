import { createContext, useContext } from "react"
import type { AgentActivity } from "@/hooks/useAgentActivity"

export interface BoxPageActions {
  isActive: boolean
  isConnected: boolean
  activity?: AgentActivity
  showFiles: boolean
  onToggleFiles: () => void
  onStop: () => void
  onDelete: () => void
  onRestart?: () => void
  isStopPending: boolean
  isDeletePending: boolean
}

const BoxPageActionsContext = createContext<BoxPageActions | null>(null)
const BoxPageSetterContext = createContext<
  ((actions: BoxPageActions | null) => void) | null
>(null)

export function useBoxPageActions() {
  return useContext(BoxPageActionsContext)
}

export function useSetBoxPageActions() {
  const setter = useContext(BoxPageSetterContext)
  if (!setter)
    throw new Error("useSetBoxPageActions must be used within BoxPageProvider")
  return setter
}

export { BoxPageActionsContext, BoxPageSetterContext }
