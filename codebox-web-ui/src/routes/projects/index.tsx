/**
 * Project chooser — shows all projects the current user can enter.
 *
 * Platform-wide inventory/lifecycle management lives at /platform/projects.
 */
import { useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FolderFavouriteIcon,
  FolderLibraryIcon,
  FolderOpenIcon,
  Shield02Icon,
} from "@hugeicons/core-free-icons"
import { Plus } from "lucide-react"
import type { Project } from "@/net/http/types"
import { useProjects } from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog"

export const Route = createFileRoute("/projects/")({
  component: ProjectsChooserPage,
})

function ProjectsChooserPage() {
  const { data: projects, isLoading } = useProjects()
  const user = useAuthStore((s) => s.user)
  const isPlatformAdmin = user?.user_type === "admin"
  const [createOpen, setCreateOpen] = useState(false)

  // Chooser only shows projects the user can actually open.
  const accessible = (projects ?? []).filter((p) => p.status === "active")

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
        <div className="flex items-center gap-2">
          <h1 className="font-display text-lg font-semibold">Projects</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
            {accessible.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isPlatformAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link to="/platform/projects" />}
              >
                <HugeiconsIcon
                  icon={Shield02Icon}
                  size={14}
                  strokeWidth={2}
                />
                Platform admin
              </Button>
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                className="gap-1.5"
              >
                <Plus size={14} />
                New project
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {accessible.length === 0 ? (
          <ChooserEmptyState
            isPlatformAdmin={isPlatformAdmin}
            onCreate={() => setCreateOpen(true)}
          />
        ) : (
          <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accessible.map((project) => (
              <ProjectChooserCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function ProjectChooserCard({ project }: { project: Project }) {
  return (
    <Link
      to="/projects/$projectSlug"
      params={{ projectSlug: project.slug }}
      className="group/card rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HugeiconsIcon
            icon={FolderFavouriteIcon}
            size={18}
            strokeWidth={2}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display font-semibold">
            {project.name}
          </h3>
          <p className="truncate font-mono text-xs text-muted-foreground">
            /{project.slug}
          </p>
        </div>
        <HugeiconsIcon
          icon={FolderOpenIcon}
          size={16}
          strokeWidth={2}
          className="mt-1 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100"
        />
      </div>
      {project.description && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {project.description}
        </p>
      )}
    </Link>
  )
}

function ChooserEmptyState({
  isPlatformAdmin,
  onCreate,
}: {
  isPlatformAdmin: boolean
  onCreate: () => void
}) {
  return (
    <Empty className="py-20">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon
            icon={FolderLibraryIcon}
            size={24}
            strokeWidth={1.5}
          />
        </EmptyMedia>
        <EmptyTitle>No projects available</EmptyTitle>
        <EmptyDescription>
          {isPlatformAdmin
            ? "Create the first project to get started."
            : "Ask a platform admin to add you to a project."}
        </EmptyDescription>
      </EmptyHeader>
      {isPlatformAdmin && (
        <Button onClick={onCreate} className="gap-1.5">
          <Plus size={16} />
          Create project
        </Button>
      )}
    </Empty>
  )
}
