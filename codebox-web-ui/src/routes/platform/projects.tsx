import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useProjects } from "@/net/query"
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog"
import { InventorySkeleton } from "@/components/platform/projects/InventorySkeleton"
import { PlatformEmptyState } from "@/components/platform/projects/PlatformEmptyState"
import { PlatformProjectsTable } from "@/components/platform/projects/PlatformProjectsTable"

export const Route = createFileRoute("/platform/projects")({
  component: PlatformProjectsPage,
})

function PlatformProjectsPage() {
  const { data: projects, isLoading } = useProjects()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex h-svh flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Projects
          </h1>
          {!isLoading && projects && projects.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              {projects.length}
            </span>
          )}
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus size={16} />
          New Project
        </Button>
      </div>

      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl">
          {isLoading ? (
            <InventorySkeleton />
          ) : !projects || projects.length === 0 ? (
            <PlatformEmptyState onCreate={() => setCreateOpen(true)} />
          ) : (
            <PlatformProjectsTable projects={projects} />
          )}
        </div>
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}