import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { HugeiconsIcon } from "@hugeicons/react"
import { Github01Icon } from "@hugeicons/core-free-icons"
import { Plus } from "lucide-react"
import { useBoxes, useCreateBox } from "@/net/query"
import { BoxStatus } from "@/net/http/types"
import type { Box } from "@/net/http/types"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({ component: HomePage })

const ACTIVE_STATUSES = [BoxStatus.STARTING, BoxStatus.RUNNING, BoxStatus.IDLE]

function statusDotColor(status: BoxStatus): string {
  const map: Record<BoxStatus, string> = {
    [BoxStatus.STARTING]: "bg-warning",
    [BoxStatus.RUNNING]: "bg-success",
    [BoxStatus.IDLE]: "bg-blue-400",
    [BoxStatus.COMPLETED]: "bg-success/50",
    [BoxStatus.FAILED]: "bg-destructive",
    [BoxStatus.CANCELLED]: "bg-muted-foreground/30",
    [BoxStatus.STOPPED]: "bg-muted-foreground/30",
  }
  return map[status] ?? "bg-muted-foreground/30"
}

function HomePage() {
  const { data: boxes, isLoading } = useBoxes()
  const createMutation = useCreateBox()
  const navigate = useNavigate()

  const activeBoxes = (boxes ?? []).filter((b) => ACTIVE_STATUSES.includes(b.status))
  const recentBoxes = (boxes ?? []).filter((b) => !ACTIVE_STATUSES.includes(b.status))

  const handleCreate = () => {
    createMutation.mutate(
      {},
      {
        onSuccess: (box) => {
          toast.success("Agent created")
          navigate({ to: "/boxes/$boxId", params: { boxId: box.id } })
        },
        onError: () => toast.error("Failed to create agent"),
      },
    )
  }

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-y-auto">
      {/* Page header */}
      <div className="bg-hero-gradient px-6 pt-10 pb-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-bold tracking-tight">
                Agents
              </h1>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                Your running and recent coding agents.
              </p>
            </div>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="gap-1.5">
              <Plus size={16} />
              New Agent
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl">
          {isLoading ? (
            <div className="pt-8">
              <Skeleton className="mb-4 h-3 w-16 rounded" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-2xl" />
                ))}
              </div>
            </div>
          ) : boxes && boxes.length > 0 ? (
            <>
              {/* Active agents */}
              {activeBoxes.length > 0 && (
                <section className="pt-8">
                  <h2 className="font-display mb-4 max-w-xs text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Active
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {activeBoxes.map((box, i) => (
                      <AgentCard
                        key={box.id}
                        box={box}
                        style={{ animationDelay: `${i * 60}ms` }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Recent agents */}
              {recentBoxes.length > 0 && (
                <section className="pt-8">
                  <h2 className="font-display mb-4 max-w-xs text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Recent
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {recentBoxes.map((box, i) => (
                      <AgentCard
                        key={box.id}
                        box={box}
                        style={{ animationDelay: `${i * 60}ms` }}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="rounded-2xl border border-dashed border-muted-foreground/20 p-12">
                <h2 className="font-display text-lg font-semibold">No agents yet</h2>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Create your first agent to start coding.
                </p>
                <Button
                  className="mt-6 gap-1.5"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  <Plus size={16} />
                  New Agent
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentCard({ box, style }: { box: Box; style?: React.CSSProperties }) {
  const isActive = ACTIVE_STATUSES.includes(box.status)
  const dotColor = statusDotColor(box.status)

  return (
    <Link to="/boxes/$boxId" params={{ boxId: box.id }} className="block">
      <Card
        className={cn(
          "card-glow animate-fade-up cursor-pointer border-0 ring-1 ring-foreground/[0.06]",
          isActive && "ring-primary/20",
        )}
        style={style}
      >
        <CardContent className="space-y-3 p-4">
          {/* Top row: status dot + name */}
          <div className="flex items-center gap-3">
            <span className="relative flex size-2.5 shrink-0">
              {isActive && (
                <span
                  className={cn(
                    "absolute inline-flex size-full rounded-full opacity-60 animate-breathe",
                    dotColor,
                  )}
                />
              )}
              <span className={cn("relative inline-flex size-2.5 rounded-full", dotColor)} />
            </span>
            <h3 className="font-display truncate text-sm font-semibold">{box.name}</h3>
          </div>

          {/* Prompt preview */}
          {box.initial_prompt && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">
              {box.initial_prompt}
            </p>
          )}

          {/* Bottom meta row */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{box.model}</span>
              {box.github_repo && (
                <Badge variant="outline" className="gap-1 py-0 text-[10px]">
                  <HugeiconsIcon icon={Github01Icon} size={10} />
                  {box.github_repo.split("/").pop()}
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground/60">
              {formatDistanceToNow(new Date(box.created_at), { addSuffix: true })}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
