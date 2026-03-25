declare global {
  interface Window {
    __ENV__?: {
      API_URL?: string
      WS_URL?: string
    }
  }
}

const DEFAULT_API_URL = "http://localhost:8080"
const DEFAULT_WS_URL = "ws://localhost:8080"

export const API_URL: string = import.meta.env.SSR
  ? (process.env.API_URL ?? DEFAULT_API_URL)
  : (window.__ENV__?.API_URL ?? DEFAULT_API_URL)

export const WS_URL: string = import.meta.env.SSR
  ? (process.env.WS_URL ?? DEFAULT_WS_URL)
  : (window.__ENV__?.WS_URL ?? DEFAULT_WS_URL)
