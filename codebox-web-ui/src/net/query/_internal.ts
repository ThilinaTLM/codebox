import { useAuthStore } from "@/lib/auth"

export interface QueryHookOptions {
  enabled?: boolean
}

export function useAuthQueryEnabled(enabled: boolean = true): boolean {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated && enabled
}