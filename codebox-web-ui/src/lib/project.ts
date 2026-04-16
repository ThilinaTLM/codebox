import { create } from "zustand"
import type { Project } from "@/net/http/types"

interface ProjectState {
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void
}

const isBrowser = typeof window !== "undefined"

function loadProject(): Project | null {
  if (!isBrowser) return null
  try {
    const raw = localStorage.getItem("current_project")
    return raw ? (JSON.parse(raw) as Project) : null
  } catch {
    return null
  }
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: loadProject(),

  setCurrentProject: (project) => {
    if (project) {
      localStorage.setItem("current_project", JSON.stringify(project))
    } else {
      localStorage.removeItem("current_project")
    }
    set({ currentProject: project })
  },
}))
