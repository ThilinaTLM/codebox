// ── Query-key factories ──────────────────────────────────────
// Centralised key factories per domain.  Every hook and every
// queryClient.invalidateQueries / setQueryData call should use
// these instead of hand-written string tuples.

export const authKeys = {
  me: () => ["auth", "me"] as const,
  users: {
    all: () => ["users"] as const,
  },
}

export const projectsKeys = {
  all: () => ["projects"] as const,
  list: (userId: string | undefined) => ["projects", userId] as const,
  detail: (slug: string) => ["projects", slug] as const,
  members: (slug: string) => ["projects", slug, "members"] as const,
  memberCandidates: (slug: string, query: string, limit: number) =>
    ["projects", slug, "member-candidates", query, limit] as const,
  settings: (slug: string) => ["projects", slug, "settings"] as const,
  github: {
    status: (slug: string) => ["projects", slug, "github", "status"] as const,
    installations: (slug: string) =>
      ["projects", slug, "github", "installations"] as const,
    repos: (slug: string) => ["projects", slug, "github", "repos"] as const,
    branches: (slug: string, repo: string | undefined) =>
      ["projects", slug, "github", "branches", repo] as const,
    all: (slug: string) => ["projects", slug, "github"] as const,
  },
}

export const boxesKeys = {
  list: (projectSlug: string, status?: string, trigger?: string) =>
    ["projects", projectSlug, "boxes", status ?? "all", trigger ?? "all"] as const,
  detail: (projectSlug: string, boxId: string) =>
    ["projects", projectSlug, "boxes", boxId] as const,
  events: (projectSlug: string, boxId: string, limit?: number) =>
    ["projects", projectSlug, "boxes", boxId, "events", limit ?? "all"] as const,
  files: (projectSlug: string, boxId: string, path: string) =>
    ["projects", projectSlug, "boxes", boxId, "files", path] as const,
  fileContent: (projectSlug: string, boxId: string, path: string) =>
    ["projects", projectSlug, "boxes", boxId, "file-content", path] as const,
  logs: (projectSlug: string, boxId: string, tail: number) =>
    ["projects", projectSlug, "boxes", boxId, "logs", tail] as const,
  all: (projectSlug: string) => ["projects", projectSlug, "boxes"] as const,
}

export const modelsKeys = {
  list: (projectSlug: string, profileId?: string) =>
    ["projects", projectSlug, "models", profileId ?? "default"] as const,
}

export const llmProfilesKeys = {
  all: (projectSlug: string) =>
    ["projects", projectSlug, "llm-profiles"] as const,
}

export const automationsKeys = {
  all: (projectSlug: string) =>
    ["projects", projectSlug, "automations"] as const,
  detail: (projectSlug: string, id: string) =>
    ["projects", projectSlug, "automations", id] as const,
  runs: (projectSlug: string, id: string, params?: object) =>
    ["projects", projectSlug, "automations", id, "runs", params ?? {}] as const,
  infiniteRuns: (projectSlug: string, id: string, params?: object) =>
    ["projects", projectSlug, "automations", id, "runs", "infinite", params ?? {}] as const,
}

export const platformKeys = {
  orphanContainers: () => ["platform", "orphan-containers"] as const,
}