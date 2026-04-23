import { useEffect } from "react"
import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router"
import { useAuthStore } from "@/lib/auth"
import { useProjectStore } from "@/lib/project"
import { useProject } from "@/net/query"
import { CodeboxLoadingState } from "@/components/layout/CodeboxLogoLoader"

export const Route = createFileRoute("/projects/$projectSlug")({
  component: ProjectLayout,
})

function ProjectLayout() {
  const { projectSlug } = Route.useParams()
  const { data: project, error, isLoading } = useProject(projectSlug)
  const setRecent = useProjectStore((s) => s.setRecentProjectSlug)
  const clearRecent = useProjectStore((s) => s.clearRecentProjectSlug)
  const user = useAuthStore((s) => s.user)
  const isPlatformAdmin = user?.user_type === "admin"

  useEffect(() => {
    if (project) {
      setRecent(project.slug)
    }
  }, [project, setRecent])

  useEffect(() => {
    if (error) {
      // Project vanished or user lost access — clear cache-of-record.
      clearRecent()
    }
  }, [error, clearRecent])

  if (isLoading) {
    return (
      <div className="flex h-[calc(100svh-24px)] items-center justify-center">
        <CodeboxLoadingState message="Loading project…" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <Navigate
        to={isPlatformAdmin ? "/platform/projects" : "/projects"}
        replace
      />
    )
  }

  // Non-admins can't view archived projects (backend enforces this too).
  if (project.status === "archived" && !isPlatformAdmin) {
    return <Navigate to="/projects" replace />
  }

  return <Outlet />
}
