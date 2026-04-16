/**
 * Projects listing page — shows all projects the user has access to.
 */
import { Link, createFileRoute } from "@tanstack/react-router"
import { FolderOpen, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjects } from "@/net/query"
import { useAuthStore } from "@/lib/auth"

export const Route = createFileRoute("/projects/")({
  component: ProjectsPage,
})

function ProjectsPage() {
  const { data: projects, isLoading } = useProjects()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.user_type === "admin"

  if (isLoading) {
    return (
      <div className="flex h-[calc(100svh-24px)] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h1 className="font-display text-lg font-semibold">Projects</h1>
        {isAdmin && (
          <Button size="sm" onClick={() => { /* TODO: show create dialog */ }}>
            <Plus size={16} />
            New Project
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {!projects?.length ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No projects yet. {isAdmin ? "Create one to get started." : "Ask an admin to add you to a project."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                to="/projects/$projectSlug"
                params={{ projectSlug: project.slug }}
                className="rounded-lg border p-4 transition-colors hover:border-foreground/20 hover:bg-muted/50"
              >
                <h3 className="font-display font-semibold">{project.name}</h3>
                {project.description && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  /{project.slug}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
