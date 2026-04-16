declare global {
  interface Window {
    __ENV__?: {
      CODEBOX_API_URL?: string
    }
  }
}

const DEFAULT_API_URL = "http://localhost:9090"

/**
 * Base URL used for REST + SSE calls to the orchestrator.
 *
 * On the server (SSR / Nitro) this resolves to `CODEBOX_API_URL`, which
 * should point to the *internal* orchestrator address (a Docker service
 * name works) so SSR fetches don't go out through the public load
 * balancer.
 *
 * In the browser it resolves to the value hydrated into
 * `window.__ENV__.CODEBOX_API_URL`. The server renders that from
 * `CODEBOX_PUBLIC_API_URL` (the public base URL the browser can reach)
 * and falls back to `CODEBOX_API_URL` for local dev where the two are
 * the same.
 */
export const API_URL: string = import.meta.env.SSR
  ? (process.env.CODEBOX_API_URL ?? DEFAULT_API_URL)
  : (window.__ENV__?.CODEBOX_API_URL ?? DEFAULT_API_URL)
