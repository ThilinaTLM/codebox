import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowReloadHorizontalIcon,
  CheckmarkCircle02Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"
import type { OrphanContainer, OrphanReason } from "@/net/http/types"
import {
  useDeleteOrphanContainer,
  useOrphanContainers,
} from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/platform/orphans")({
  component: OrphansPage,
})

// ── Helpers ─────────────────────────────────────────────────

const REASON_COPY: Record<
  OrphanReason,
  { label: string; description: string; variant: "destructive" | "outline" | "secondary" }
> = {
  missing: {
    label: "Missing",
    description: "No Box record for this container. Likely a hard-delete or restored DB.",
    variant: "destructive",
  },
  deleted: {
    label: "Deleted",
    description: "Box was deleted but the container removal failed or was skipped.",
    variant: "destructive",
  },
  unlabeled: {
    label: "Unlabeled",
    description: "Container carries the sandbox label but no box id — likely manual or legacy.",
    variant: "outline",
  },
}

function formatAge(dateStr: string | null): string {
  if (!dateStr) return ""
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return ""
  }
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id
}

// ── Page ────────────────────────────────────────────────────

function OrphansPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const isAdmin = user?.user_type === "admin"
  const { data: orphans = [], isLoading, isFetching, refetch } =
    useOrphanContainers()

  useEffect(() => {
    if (!isAdmin) {
      navigate({ to: "/" })
    }
  }, [isAdmin, navigate])

  if (!isAdmin) return null

  return (
    <div className="flex h-svh flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Orphan Containers
          </h1>
          {!isLoading && orphans.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              {orphans.length}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <HugeiconsIcon
            icon={ArrowReloadHorizontalIcon}
            size={14}
            strokeWidth={2}
          />
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl">
          <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
            Containers labelled as codebox sandboxes that no longer have a
            live Box backing them. Removing one will also delete its
            workspace and app volumes.
          </p>
          {isLoading ? (
            <OrphansTableSkeleton />
          ) : orphans.length === 0 ? (
            <OrphansEmptyState />
          ) : (
            <OrphansTable orphans={orphans} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Table ───────────────────────────────────────────────────

function OrphansTable({ orphans }: { orphans: Array<OrphanContainer> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Container</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Box</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orphans.map((o) => (
          <OrphanRow key={o.container_id} orphan={o} />
        ))}
      </TableBody>
    </Table>
  )
}

function OrphanRow({ orphan }: { orphan: OrphanContainer }) {
  const deleteMutation = useDeleteOrphanContainer()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const copy = REASON_COPY[orphan.reason]

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex flex-col">
            <span className="font-mono text-xs font-medium">
              {orphan.container_name}
            </span>
            <span className="font-mono text-2xs text-muted-foreground">
              {shortId(orphan.container_id)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <Badge variant={copy.variant}>{copy.label}</Badge>
            <span className="text-2xs text-muted-foreground">
              {copy.description}
            </span>
          </div>
        </TableCell>
        <TableCell>
          {orphan.box_id ? (
            <div className="flex flex-col">
              <span className="text-sm">{orphan.box_name || "—"}</span>
              <span className="font-mono text-2xs text-muted-foreground">
                {orphan.box_id.slice(0, 8)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {orphan.project_id ? (
            <span className="font-mono text-2xs">
              {orphan.project_id.slice(0, 8)}
            </span>
          ) : (
            "—"
          )}
        </TableCell>
        <TableCell>
          <Badge variant="secondary">{orphan.status || "unknown"}</Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatAge(orphan.created_at)}
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete orphan container"
          >
            <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
          </Button>
        </TableCell>
      </TableRow>
      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete orphan container"
        description={`Remove container ${orphan.container_name} and its -app and -workspace volumes? This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          deleteMutation.mutate(orphan.container_id, {
            onSuccess: () => {
              toast.success(`Removed ${orphan.container_name}`)
              setConfirmDelete(false)
            },
            onError: () =>
              toast.error("Failed to remove container — check orchestrator logs"),
          })
        }}
      />
    </>
  )
}

// ── Loading Skeleton ────────────────────────────────────────

function OrphansTableSkeleton() {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-8 px-3">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-3 w-20 rounded" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="h-3 w-32 rounded" />
          <Skeleton className="ml-4 h-5 w-16 rounded-full" />
          <Skeleton className="ml-4 h-3 w-24 rounded" />
          <Skeleton className="ml-auto h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  )
}

// ── Empty State ─────────────────────────────────────────────

function OrphansEmptyState() {
  return (
    <Empty className="py-32">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={24}
            strokeWidth={1.5}
          />
        </EmptyMedia>
        <EmptyTitle>No orphan containers</EmptyTitle>
        <EmptyDescription>
          Every sandbox container on this host is backed by a live Box.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

