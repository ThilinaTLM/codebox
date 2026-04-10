import { create } from "zustand"

export interface AuthUser {
  id: string
  username: string
  user_type: "admin" | "user"
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem("auth_user")
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("auth_token"),
  user: loadUser(),
  isAuthenticated: !!localStorage.getItem("auth_token"),

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
}))
