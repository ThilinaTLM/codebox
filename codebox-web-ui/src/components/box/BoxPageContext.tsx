import { createContext, useContext } from "react"

export interface BoxPageActions {
  isActive: boolean
  isConnected: boolean
}

const BoxPageActionsContext = createContext<BoxPageActions | null>(null)
const BoxPageSetterContext = createContext<((actions: BoxPageActions | null) => void) | null>(null)

export function useBoxPageActions() {
  return useContext(BoxPageActionsContext)
}

export function useSetBoxPageActions() {
  const setter = useContext(BoxPageSetterContext)
  if (!setter) throw new Error("useSetBoxPageActions must be used within BoxPageProvider")
  return setter
}

export { BoxPageActionsContext, BoxPageSetterContext }
