import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import type { Container } from "@/net/http/types"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  useContainers,
  useDeleteContainer,
  useStartContainer,
  useStopContainer,
} from "@/net/query"
import { Skeleton } from "@/components/ui/skeleton"

// ── Status badge ────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { color: string; label: string; ping?: boolean }
> = {
  running: { color: "bg-success", label: "Running", ping: true },
  exited: { color: "bg-muted-foreground/60", label: "Exited" },
  created: { color: "bg-warning", label: "Created" },
  paused: { color: "bg-muted-foreground/60", label: "Paused" },
  restarting: { color: "bg-warning", label: "Restarting", ping: true },
  dead: { color: "bg-destructive", label: "Dead" },
}

function ContainerStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    color: "bg-muted-foreground/60",
    label: status,
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/50 px-2.5 py-1 text-xs font-medium">
      <span className="relative flex size-2">
        {config.ping && (
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full opacity-50 ${config.color}`}
          />
        )}
        <span
          className={`relative inline-flex size-2 rounded-full ${config.color}`}
        />
      </span>
      {config.label}
    </span>
  )
}

// ── Uptime / time display ───────────────────────────────────

function TimeDisplay({ container }: { container: Container }) {
  if (container.status === "running" && container.started_at) {
    return (
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(container.started_at))}
      </span>
    )
  }
  if (container.started_at) {
    return (
      <span className="text-xs text-muted-foreground">
        Stopped{" "}
        {formatDistanceToNow(new Date(container.started_at), {
          addSuffix: true,
        })}
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground/50">—</span>
}

// ── Per-row component (owns its own mutation hooks) ─────────

function ContainerRow({ container }: { container: Container }) {
  const stopContainer = useStopContainer()
  const startContainer = useStartContainer()
  const deleteContainer = useDeleteContainer()

  const [confirmStop, setConfirmStop] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isRunning = container.status === "running"
  const isStopped = container.status === "exited" || container.status === "dead"

  return (
    <>
      <TableRow>
        <TableCell className="font-mono text-xs text-muted-foreground/60">
          {container.id.slice(0, 8)}
        </TableCell>
        <TableCell>
          <span className="font-mono text-sm">{container.name}</span>
        </TableCell>
        <TableCell>
          <span className="font-mono text-xs text-muted-foreground">
            {container.image || "—"}
          </span>
        </TableCell>
        <TableCell>
          <ContainerStatusBadge status={container.status} />
        </TableCell>
        <TableCell>
          <TimeDisplay container={container} />
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="xs"
              nativeButton={false}
              render={
                <Link
                  to="/containers/$containerId/logs"
                  params={{ containerId: container.id }}
                />
              }
            >
              Logs
            </Button>
            {isRunning && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setConfirmStop(true)}
                disabled={stopContainer.isPending}
              >
                {stopContainer.isPending ? "Stopping…" : "Stop"}
              </Button>
            )}
            {isStopped && (
              <Button
                variant="outline"
                size="xs"
                onClick={() =>
                  startContainer.mutate(container.id, {
                    onSuccess: () => toast.success("Container started"),
                    onError: () => toast.error("Failed to start container"),
                  })
                }
                disabled={startContainer.isPending}
              >
                {startContainer.isPending ? "Starting…" : "Start"}
              </Button>
            )}
            <Button
              variant="destructive"
              size="xs"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteContainer.isPending}
            >
              {deleteContainer.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Stop confirmation */}
      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop container?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop <strong>{container.name}</strong>. You can restart
              it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                stopContainer.mutate(container.id, {
                  onSuccess: () => toast.success("Container stopped"),
                  onError: () => toast.error("Failed to stop container"),
                })
              }
            >
              Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete container?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{container.name}</strong> and
              all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleteContainer.mutate(container.id, {
                  onSuccess: () => toast.success("Container deleted"),
                  onError: () => toast.error("Failed to delete container"),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ── Main table ──────────────────────────────────────────────

export function ContainerTable() {
  const { data: containers, isLoading } = useContainers()

  if (isLoading) {
    return (
      <div className="space-y-1 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (!containers?.length) {
    return (
      <Empty className="py-20">
        <EmptyHeader>
          <EmptyTitle>No containers</EmptyTitle>
          <EmptyDescription>
            Containers are created automatically when boxes start.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[80px] text-xs font-medium">ID</TableHead>
          <TableHead className="text-xs font-medium">Name</TableHead>
          <TableHead className="text-xs font-medium">Image</TableHead>
          <TableHead className="text-xs font-medium">Status</TableHead>
          <TableHead className="text-xs font-medium">Uptime</TableHead>
          <TableHead className="w-[160px] text-right text-xs font-medium">
            Actions
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {containers.map((c) => (
          <ContainerRow key={c.id} container={c} />
        ))}
      </TableBody>
    </Table>
  )
}
