import { Link, createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentTable } from "@/components/box/AgentTable"
import { DashboardStats } from "@/components/box/DashboardStats"
import { useBoxes } from "@/net/query"

export const Route = createFileRoute("/")({ component: HomePage })

function HomePage() {
  const { data: boxes, isLoading } = useBoxes()

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col overflow-y-auto">
      {/* Compact header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Agents
        </h1>
        <Button
          nativeButton={false}
          render={<Link to="/boxes/create" />}
          className="gap-1.5"
        >
          <Plus size={16} />
          New Agent
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-12">
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
                <AgentTable boxes={boxes} />
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="rounded-2xl border border-dashed border-border p-8">
                <h3 className="font-display text-lg font-semibold">
                  No agents yet
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create your first agent to get started with AI-powered coding.
                </p>
                <Button
                  nativeButton={false}
                  render={<Link to="/boxes/create" />}
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
