import { useEffect } from "react"
import { Outlet, createFileRoute } from "@tanstack/react-router"
import { useProjectStore } from "@/lib/project"
import { useProject } from "@/net/query"

export const Route = createFileRoute("/projects/$projectSlug")({
  component: ProjectLayout,
})

function ProjectLayout() {
  const { projectSlug } = Route.useParams()
  const { data: project } = useProject(projectSlug)
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject)

  useEffect(() => {
    if (project) {
      setCurrentProject(project)
    }
  }, [project, setCurrentProject])

  return <Outlet />
}
