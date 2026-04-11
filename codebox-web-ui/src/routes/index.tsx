import { Link, createFileRoute } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import type { Box } from "@/net/http/types"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentTable } from "@/components/box/AgentTable"
import { useBoxes } from "@/net/query"
import { ContainerStatus } from "@/net/http/types"

export const Route = createFileRoute("/")({ component: HomePage })

function isBoxActive(box: Box): boolean {
  return (
    box.container_status === ContainerStatus.STARTING ||
    box.container_status === ContainerStatus.RUNNING
  )
}

function HomePage() {
  const { data: boxes, isLoading } = useBoxes()

  const activeBoxes = (boxes ?? []).filter(isBoxActive)
  const recentBoxes = (boxes ?? []).filter((b) => !isBoxActive(b))

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
              <Skeleton className="h-3 w-16 rounded" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : boxes && boxes.length > 0 ? (
            <>
              {/* Active agents */}
              {activeBoxes.length > 0 && (
                <section className="pt-4">
                  <h2 className="font-terminal mb-3 text-xs tracking-widest text-ghost uppercase">
                    Active
                  </h2>
                  <AgentTable boxes={activeBoxes} variant="active" />
                </section>
              )}

              {/* Recent agents */}
              {recentBoxes.length > 0 && (
                <section className="pt-8">
                  <h2 className="font-terminal mb-3 text-xs tracking-widest text-ghost uppercase">
                    Recent
                  </h2>
                  <AgentTable boxes={recentBoxes} variant="recent" />
                </section>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="font-terminal text-lg text-ghost">
                &gt; no agents running
                <span className="animate-cursor">_</span>
              </div>
              <Button
                nativeButton={false}
                render={<Link to="/boxes/create" />}
                className="mt-6 gap-1.5"
              >
                <Plus size={16} />
                Create your first agent
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
