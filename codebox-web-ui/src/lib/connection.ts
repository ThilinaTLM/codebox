import { create } from "zustand"

/**
 * Tracks the state of the global SSE stream (`/api/stream`).
 *
 * Starts `false` and flips `true` once `useGlobalStream`'s `onopen` fires.
 * Goes back to `false` on error so the status bar can surface reconnects.
 *
 * Per-box SSE (`useChatState`) is *not* tracked here — it is scoped to the
 * box detail layout and flows through `BoxPageActionsContext` instead.
 */
interface ConnectionState {
  globalStreamConnected: boolean
  setGlobalStreamConnected: (connected: boolean) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  globalStreamConnected: false,
  setGlobalStreamConnected: (connected) =>
    set({ globalStreamConnected: connected }),
}))
