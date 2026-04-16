declare global {
  interface Window {
    __ENV__?: {
      CODEBOX_API_URL?: string
    }
  }
}

const DEFAULT_API_URL = "http://localhost:9090"

export const API_URL: string = import.meta.env.SSR
  ? (process.env.CODEBOX_API_URL ?? DEFAULT_API_URL)
  : (window.__ENV__?.CODEBOX_API_URL ?? DEFAULT_API_URL)
