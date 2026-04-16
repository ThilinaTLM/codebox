/**
 * Root index — redirects to the user's last active project or project list.
 */
import { useEffect } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useProjectStore } from "@/lib/project"
import { useProjects } from "@/net/query"

export const Route = createFileRoute("/")({
  component: RootIndex,
})

function RootIndex() {
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.currentProject)
  const { data: projects, isLoading } = useProjects()

  useEffect(() => {
    if (isLoading) return

    // If user has a saved project, go there
    if (currentProject) {
      void navigate({
        to: "/projects/$projectSlug",
        params: { projectSlug: currentProject.slug },
        replace: true,
      })
      return
    }

    // Otherwise pick the first project, or show project list
    if (projects && projects.length > 0) {
      void navigate({
        to: "/projects/$projectSlug",
        params: { projectSlug: projects[0].slug },
        replace: true,
      })
    }
  }, [isLoading, currentProject, projects, navigate])

  if (isLoading) {
    return (
      <div className="flex h-[calc(100svh-24px)] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return null
}
