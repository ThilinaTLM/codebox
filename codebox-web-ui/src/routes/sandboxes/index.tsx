import { useState } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SandboxStatusBadge } from "@/components/sandbox/SandboxStatusBadge"
import {
  useSandboxes,
  useCreateSandbox,
  useDeleteSandbox,
  useStopSandbox,
} from "@/net/query"
import { SandboxStatus } from "@/net/http/types"
import type { Sandbox } from "@/net/http/types"
import { toast } from "sonner"
import { useNavigate } from "@tanstack/react-router"

export const Route = createFileRoute("/sandboxes/")({
  component: SandboxListPage,
})

function SandboxListPage() {
  const { data: sandboxes, isLoading } = useSandboxes()
  const createMutation = useCreateSandbox()
  const deleteMutation = useDeleteSandbox()
  const stopMutation = useStopSandbox()
  const navigate = useNavigate()
  const [newName, setNewName] = useState("")

  const handleCreate = () => {
    createMutation.mutate(
      { name: newName.trim() || undefined },
      {
        onSuccess: (sandbox) => {
          toast.success("Sandbox created")
          setNewName("")
          navigate({ to: "/sandboxes/$sandboxId", params: { sandboxId: sandbox.id } })
        },
        onError: () => toast.error("Failed to create sandbox"),
      },
    )
  }

  const activeSandboxes = sandboxes?.filter(
    (s) => s.status === SandboxStatus.STARTING || s.status === SandboxStatus.READY,
  )
  const inactiveSandboxes = sandboxes?.filter(
    (s) => s.status === SandboxStatus.STOPPED || s.status === SandboxStatus.FAILED,
  )

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sandboxes</h1>
          <p className="text-sm text-muted-foreground">
            Interactive coding environments
          </p>
        </div>
      </div>

      {/* Quick create */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            New Sandbox
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Sandbox name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
              className="text-sm"
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Launch"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active sandboxes */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          {activeSandboxes && activeSandboxes.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-base font-medium text-muted-foreground">
                Active ({activeSandboxes.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeSandboxes.map((s) => (
                  <SandboxCard
                    key={s.id}
                    sandbox={s}
                    onStop={() =>
                      stopMutation.mutate(s.id, {
                        onSuccess: () => toast.success("Sandbox stopped"),
                      })
                    }
                    onDelete={() =>
                      deleteMutation.mutate(s.id, {
                        onSuccess: () => toast.success("Sandbox deleted"),
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {inactiveSandboxes && inactiveSandboxes.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-base font-medium text-muted-foreground">
                Inactive ({inactiveSandboxes.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {inactiveSandboxes.map((s) => (
                  <SandboxCard
                    key={s.id}
                    sandbox={s}
                    onDelete={() =>
                      deleteMutation.mutate(s.id, {
                        onSuccess: () => toast.success("Sandbox deleted"),
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {(!sandboxes || sandboxes.length === 0) && (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-16">
              <p className="text-sm text-muted-foreground">
                No sandboxes yet. Launch one to get started.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SandboxCard({
  sandbox,
  onStop,
  onDelete,
}: {
  sandbox: Sandbox
  onStop?: () => void
  onDelete?: () => void
}) {
  const isActive =
    sandbox.status === SandboxStatus.STARTING ||
    sandbox.status === SandboxStatus.READY

  return (
    <Card className="shadow-sm transition-colors hover:border-primary/30">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <Link
              to="/sandboxes/$sandboxId"
              params={{ sandboxId: sandbox.id }}
              className="block"
            >
              <h3 className="truncate text-sm font-semibold hover:text-primary">
                {sandbox.name}
              </h3>
            </Link>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {sandbox.model} &middot; {sandbox.id.slice(0, 8)}
            </p>
          </div>
          <SandboxStatusBadge status={sandbox.status} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          {isActive && (
            <>
              <Button variant="default" size="sm" asChild>
                <Link to="/sandboxes/$sandboxId" params={{ sandboxId: sandbox.id }}>
                  Connect
                </Link>
              </Button>
              {onStop && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onStop}
                >
                  Stop
                </Button>
              )}
            </>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
