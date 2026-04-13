import { create } from "zustand"

export interface AuthUser {
  id: string
  username: string
  user_type: "admin" | "user"
  first_name: string | null
  last_name: string | null
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  login: (token: string, user: AuthUser) => void
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
  token: isBrowser ? localStorage.getItem("auth_token") : null,
  user: loadUser(),
  isAuthenticated: isBrowser ? !!localStorage.getItem("auth_token") : false,

  login: (token, user) => {
    localStorage.setItem("auth_token", token)
    localStorage.setItem("auth_user", JSON.stringify(user))
    set({ token, user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem("auth_token")
    localStorage.removeItem("auth_user")
    set({ token: null, user: null, isAuthenticated: false })
  },

  updateUser: (patch) => {
    const current = useAuthStore.getState().user
    if (!current) return
    const updated = { ...current, ...patch }
    localStorage.setItem("auth_user", JSON.stringify(updated))
    set({ user: updated })
  },
}))
