import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SandboxStatusBadge } from "@/components/sandbox/SandboxStatusBadge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon } from "@hugeicons/core-free-icons"
import { useSandboxes, useCreateSandbox } from "@/net/query"
import { SandboxStatus } from "@/net/http/types"
import type { Sandbox } from "@/net/http/types"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({ component: HomePage })

function HomePage() {
  const { data: sandboxes, isLoading } = useSandboxes()
  const createMutation = useCreateSandbox()
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState("")

  const handleCreate = () => {
    const name = prompt.trim() || undefined
    createMutation.mutate(
      { name },
      {
        onSuccess: (sandbox) => {
          toast.success("Sandbox created")
          setPrompt("")
          navigate({ to: "/sandboxes/$sandboxId", params: { sandboxId: sandbox.id } })
        },
        onError: () => toast.error("Failed to create sandbox"),
      },
    )
  }

  const recentSandboxes = sandboxes?.slice(0, 9)

  return (
    <div className="flex h-svh flex-col">
      {/* Minimal header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <SidebarTrigger />
      </div>

      {/* Hero */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-2xl space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">
              What would you like to build?
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Start a new sandbox or continue where you left off.
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

      {/* Sandbox grid */}
      <div className="border-t px-6 py-8">
        <div className="mx-auto max-w-5xl">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : recentSandboxes && recentSandboxes.length > 0 ? (
            <>
              <h2 className="mb-4 text-sm font-medium text-muted-foreground">
                Recent sandboxes
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentSandboxes.map((sandbox) => (
                  <SandboxGridCard key={sandbox.id} sandbox={sandbox} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              No sandboxes yet. Create one above to get started.
            </p>
          )}

          <div className="mt-4 flex justify-center">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/tasks" />} className="text-xs text-muted-foreground">
              View all tasks
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SandboxGridCard({ sandbox }: { sandbox: Sandbox }) {
  const isActive =
    sandbox.status === SandboxStatus.STARTING ||
    sandbox.status === SandboxStatus.READY

  return (
    <Link
      to="/sandboxes/$sandboxId"
      params={{ sandboxId: sandbox.id }}
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
              <h3 className="truncate text-sm font-medium">{sandbox.name}</h3>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {sandbox.model}
              </p>
            </div>
            <SandboxStatusBadge status={sandbox.status} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(sandbox.created_at), { addSuffix: true })}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
