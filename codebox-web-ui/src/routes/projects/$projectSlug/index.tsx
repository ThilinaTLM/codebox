/**
 * Project home — box listing page.
 * This is essentially the old routes/index.tsx but project-scoped.
 */
import { Link, createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { AgentTable } from "@/components/box/AgentTable"
import { Button } from "@/components/ui/button"
import { useBoxes } from "@/net/query"

export const Route = createFileRoute("/projects/$projectSlug/")({
  component: ProjectHomePage,
})

function ProjectHomePage() {
  const { projectSlug } = Route.useParams()
  const { data: boxes, isLoading } = useBoxes(projectSlug)

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h1 className="font-display text-lg font-semibold">Agents</h1>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link to="/projects/$projectSlug/boxes/create" params={{ projectSlug }} />
          }
        >
          <Plus size={16} />
          New Agent
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AgentTable
          boxes={boxes ?? []}
          isLoading={isLoading}
          projectSlug={projectSlug}
        />
      </div>
    </div>
  )
}
