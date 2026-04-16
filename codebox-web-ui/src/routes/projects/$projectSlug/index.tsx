/**
 * Project home — box listing page.
 * Project-scoped version of the former `/` landing page.
 */
import { Link, createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { AgentTable } from "@/components/box/AgentTable"
import { DashboardStats } from "@/components/box/DashboardStats"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useBoxes } from "@/net/query"

export const Route = createFileRoute("/projects/$projectSlug/")({
  component: ProjectHomePage,
})

function ProjectHomePage() {
  const { projectSlug } = Route.useParams()
  const { data: boxes, isLoading } = useBoxes(projectSlug)

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      {/* Sticky top bar */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-3">
        <h1 className="font-display text-lg font-semibold">Agents</h1>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link
              to="/projects/$projectSlug/boxes/create"
              params={{ projectSlug }}
            />
          }
        >
          <Plus size={16} />
          New Agent
        </Button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-12 pt-4">
        <div className="mx-auto max-w-6xl">
          {isLoading ? (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
              <Skeleton className="mt-6 h-3 w-16 rounded" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : boxes && boxes.length > 0 ? (
            <>
              <DashboardStats boxes={boxes} />
              <div className="mt-6">
                <AgentTable boxes={boxes} projectSlug={projectSlug} />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="rounded-2xl border border-dashed border-border p-8">
                <h3 className="font-display text-lg font-semibold">
                  No agents yet
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create your first agent to get started with AI-powered
                  coding.
                </p>
                <Button
                  nativeButton={false}
                  render={
                    <Link
                      to="/projects/$projectSlug/boxes/create"
                      params={{ projectSlug }}
                    />
                  }
                  className="mt-4 gap-1.5"
                >
                  <Plus size={16} />
                  Create Agent
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
