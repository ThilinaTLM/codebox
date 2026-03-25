import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { BoxStatusBadge } from "@/components/box/BoxStatusBadge"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon, Github01Icon } from "@hugeicons/core-free-icons"
import { useBoxes, useCreateBox } from "@/net/query"
import { BoxStatus } from "@/net/http/types"
import type { Box } from "@/net/http/types"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({ component: HomePage })

function HomePage() {
  const { data: boxes, isLoading } = useBoxes()
  const createMutation = useCreateBox()
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState("")

  const handleCreate = () => {
    const name = prompt.trim() || undefined
    createMutation.mutate(
      { name },
      {
        onSuccess: (box) => {
          toast.success("Box created")
          setPrompt("")
          navigate({ to: "/boxes/$boxId", params: { boxId: box.id } })
        },
        onError: () => toast.error("Failed to create box"),
      },
    )
  }

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col">
      {/* Hero */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-2xl space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">
              What would you like to build?
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Start a new box or continue where you left off.
            </p>
          </div>

          {/* Create input */}
          <div className="relative">
            <div className="rounded-2xl border bg-card shadow-sm">
              <textarea
                placeholder="Describe your project or just start coding..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleCreate()
                  }
                }}
                rows={2}
                className="w-full resize-none rounded-2xl bg-transparent px-4 pt-4 pb-12 text-sm outline-none placeholder:text-muted-foreground/60"
              />
              <div className="absolute right-3 bottom-3">
                <Button
                  size="icon-sm"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={2.5} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Box grid */}
      <div className="border-t px-6 py-8">
        <div className="mx-auto max-w-5xl">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : boxes && boxes.length > 0 ? (
            <>
              <h2 className="mb-4 text-sm font-medium text-muted-foreground">
                Your boxes
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {boxes.map((box) => (
                  <BoxGridCard key={box.id} box={box} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              No boxes yet. Create one above to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function BoxGridCard({ box }: { box: Box }) {
  const isActive =
    box.status === BoxStatus.STARTING ||
    box.status === BoxStatus.RUNNING ||
    box.status === BoxStatus.IDLE

  return (
    <Link
      to="/boxes/$boxId"
      params={{ boxId: box.id }}
      className="block"
    >
      <Card
        className={cn(
          "border-l-2 shadow-sm transition-all hover:shadow-md hover:border-primary/30",
          isActive ? "border-l-success/60" : "border-l-border",
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-sm font-medium">{box.name}</h3>
                {box.trigger && (
                  <HugeiconsIcon
                    icon={Github01Icon}
                    size={12}
                    className="shrink-0 text-muted-foreground"
                  />
                )}
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {box.model}
              </p>
            </div>
            <BoxStatusBadge status={box.status} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(box.created_at), { addSuffix: true })}
            </p>
            {box.github_repo && (
              <Badge variant="outline" className="text-xs">
                {box.github_repo}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
