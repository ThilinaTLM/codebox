import { create } from "zustand"
import { API_URL } from "@/lib/constants"

export interface AuthUser {
  id: string
  username: string
  user_type: "admin" | "user"
  first_name: string | null
  last_name: string | null
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (user: AuthUser) => void
  logout: () => void
  updateUser: (patch: Partial<AuthUser>) => void
}

const isBrowser = typeof window !== "undefined"

function loadUser(): AuthUser | null {
  if (!isBrowser) return null
  try {
    const raw = localStorage.getItem("auth_user")
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadUser(),
  isAuthenticated: isBrowser ? localStorage.getItem("auth_user") !== null : false,

  login: (user) => {
    localStorage.setItem("auth_user", JSON.stringify(user))
    set({ user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem("auth_user")
    set({ user: null, isAuthenticated: false })
    // Fire-and-forget: clear the HttpOnly auth cookie on the server.
    void fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => { /* best-effort */ })
  },

  updateUser: (patch) => {
    const current = useAuthStore.getState().user
    if (!current) return
    const updated = { ...current, ...patch }
    localStorage.setItem("auth_user", JSON.stringify(updated))
    set({ user: updated })
  },
}))
