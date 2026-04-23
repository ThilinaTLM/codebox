/**
 * Root index — dispatches authenticated users to the right landing page.
 *
 * - Platform admin → `/platform/projects`
 * - Non-admin with a recent accessible project → that project
 * - Non-admin with exactly one accessible project → that project
 * - Non-admin with multiple (or zero) projects → `/projects` chooser
 */
import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useAuthStore } from "@/lib/auth"
import { useProjectStore } from "@/lib/project"
import { useProjects } from "@/net/query"
import { CodeboxLoadingState } from "@/components/layout/CodeboxLogoLoader"

export const Route = createFileRoute("/")({
  component: RootIndex,
})

function RootIndex() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isPlatformAdmin = user?.user_type === "admin"
  const recentSlug = useProjectStore((s) => s.recentProjectSlug)
  const clearRecent = useProjectStore((s) => s.clearRecentProjectSlug)
  const { data: projects, isLoading } = useProjects({
    enabled: !isPlatformAdmin,
  })

  useEffect(() => {
    if (isPlatformAdmin) {
      void navigate({ to: "/platform/projects", replace: true })
      return
    }

    if (isLoading) return

    const list = projects ?? []

    // Recent slug still valid → use it.
    if (recentSlug && list.some((p) => p.slug === recentSlug && p.status === "active")) {
      void navigate({
        to: "/projects/$projectSlug",
        params: { projectSlug: recentSlug },
        replace: true,
      })
      return
    }

    // Stale recent slug → clear it.
    if (recentSlug) {
      clearRecent()
    }

    const activeProjects = list.filter((p) => p.status === "active")

    if (activeProjects.length === 1) {
      void navigate({
        to: "/projects/$projectSlug",
        params: { projectSlug: activeProjects[0].slug },
        replace: true,
      })
      return
    }

    void navigate({ to: "/projects", replace: true })
  }, [
    isPlatformAdmin,
    isLoading,
    projects,
    recentSlug,
    clearRecent,
    navigate,
  ])

  return (
    <div className="flex h-svh items-center justify-center">
      <CodeboxLoadingState message="Loading…" />
    </div>
  )
}
