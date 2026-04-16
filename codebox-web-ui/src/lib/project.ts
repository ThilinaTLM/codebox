import { create } from "zustand"

interface ProjectState {
  /**
   * Slug of the most recently opened project.
   *
   * This is **not** the source of truth for "which project am I in right now" —
   * that lives in the URL. This is only a hint used for convenience redirects
   * (e.g. deciding where to send the user from `/`).
   */
  recentProjectSlug: string | null
  setRecentProjectSlug: (slug: string | null) => void
  clearRecentProjectSlug: () => void
}

const STORAGE_KEY = "recent_project_slug"
const LEGACY_STORAGE_KEY = "current_project"
const isBrowser = typeof window !== "undefined"

function loadRecentSlug(): string | null {
  if (!isBrowser) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return raw
    // Migrate from legacy "current_project" blob if present.
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy) as { slug?: unknown }
        if (typeof parsed.slug === "string" && parsed.slug) {
          localStorage.setItem(STORAGE_KEY, parsed.slug)
          localStorage.removeItem(LEGACY_STORAGE_KEY)
          return parsed.slug
        }
      } catch {
        /* ignore */
      }
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    }
    return null
  } catch {
    return null
  }
}

export const useProjectStore = create<ProjectState>((set) => ({
  recentProjectSlug: loadRecentSlug(),

  setRecentProjectSlug: (slug) => {
    if (!isBrowser) {
      set({ recentProjectSlug: slug })
      return
    }
    if (slug) {
      localStorage.setItem(STORAGE_KEY, slug)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    set({ recentProjectSlug: slug })
  },

  clearRecentProjectSlug: () => {
    if (isBrowser) localStorage.removeItem(STORAGE_KEY)
    set({ recentProjectSlug: null })
  },
}))
