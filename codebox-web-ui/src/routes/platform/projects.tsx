import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import axios from "axios"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  Delete02Icon,
  Edit02Icon,
  FolderLibraryIcon,
  FolderOpenIcon,
  MoreHorizontalCircle01Icon,
  PackageReceiveIcon,
} from "@hugeicons/core-free-icons"
import type { Project } from "@/net/http/types"
import {
  useArchiveProject,
  useDeleteProject,
  useProjects,
  useRestoreProject,
} from "@/net/query"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog"
import { EditProjectDialog } from "@/components/projects/EditProjectDialog"
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge"

export const Route = createFileRoute("/platform/projects")({
  component: PlatformProjectsPage,
})

function describeError(fallback: string, err: unknown): string {
  if (
    axios.isAxiosError(err) &&
    typeof err.response?.data?.detail === "string"
  ) {
    return err.response.data.detail
  }
  return fallback
}

function PlatformProjectsPage() {
  const { data: projects, isLoading } = useProjects()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex h-svh flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Projects
          </h1>
          {!isLoading && projects && projects.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              {projects.length}
            </span>
          )}
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus size={16} />
          New Project
        </Button>
      </div>

      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl">
          {isLoading ? (
            <InventorySkeleton />
          ) : !projects || projects.length === 0 ? (
            <PlatformEmptyState onCreate={() => setCreateOpen(true)} />
          ) : (
            <PlatformProjectsTable projects={projects} />
          )}
        </div>
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function PlatformProjectsTable({ projects }: { projects: Array<Project> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <ProjectRow key={project.id} project={project} />
        ))}
      </TableBody>
    </Table>
  )
}

function ProjectRow({ project }: { project: Project }) {
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const archiveMutation = useArchiveProject(project.slug)
  const restoreMutation = useRestoreProject(project.slug)
  const deleteMutation = useDeleteProject(project.slug)

  const openProject = () => {
    void navigate({
      to: "/projects/$projectSlug",
      params: { projectSlug: project.slug },
    })
  }

  return (
    <>
      <TableRow
        role="button"
        tabIndex={0}
        onClick={openProject}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openProject()
          }
        }}
        className="cursor-pointer"
      >
        <TableCell>
          <div className="flex flex-col">
            <span className="font-medium">{project.name}</span>
            {project.description && (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {project.description}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <ProjectStatusBadge status={project.status} />
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {project.slug}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatDistanceToNow(new Date(project.created_at), {
            addSuffix: true,
          })}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                />
              }
            >
              <HugeiconsIcon
                icon={MoreHorizontalCircle01Icon}
                size={16}
                strokeWidth={2}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openProject}>
                <HugeiconsIcon
                  icon={FolderOpenIcon}
                  size={16}
                  strokeWidth={2}
                />
                Open project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={2} />
                Edit metadata
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {project.status === "active" && (
                <DropdownMenuItem onClick={() => setConfirmArchive(true)}>
                  <HugeiconsIcon
                    icon={Archive02Icon}
                    size={16}
                    strokeWidth={2}
                  />
                  Archive
                </DropdownMenuItem>
              )}
              {project.status === "archived" && (
                <DropdownMenuItem onClick={() => setConfirmRestore(true)}>
                  <HugeiconsIcon
                    icon={PackageReceiveIcon}
                    size={16}
                    strokeWidth={2}
                  />
                  Restore
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <HugeiconsIcon
                  icon={Delete02Icon}
                  size={16}
                  strokeWidth={2}
                />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <EditProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
      />

      <ConfirmActionDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive project"
        description={`Archive "${project.name}"? Members will lose access until you restore it.`}
        confirmLabel="Archive"
        isPending={archiveMutation.isPending}
        onConfirm={() =>
          archiveMutation.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Archived "${project.name}"`)
              setConfirmArchive(false)
            },
            onError: (err) =>
              toast.error(describeError("Failed to archive project", err)),
          })
        }
      />

      <ConfirmActionDialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        title="Restore project"
        description={`Restore "${project.name}" to active status?`}
        confirmLabel="Restore"
        isPending={restoreMutation.isPending}
        onConfirm={() =>
          restoreMutation.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Restored "${project.name}"`)
              setConfirmRestore(false)
            },
            onError: (err) =>
              toast.error(describeError("Failed to restore project", err)),
          })
        }
      />

      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete project"
        description={`Delete "${project.name}"? Agents and settings will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Deleted "${project.name}"`)
              setConfirmDelete(false)
            },
            onError: (err) =>
              toast.error(describeError("Failed to delete project", err)),
          })
        }
      />
    </>
  )
}

function InventorySkeleton() {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-8 px-3">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-3 w-20 rounded" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-3">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="ml-auto h-3 w-20 rounded" />
        </div>
      ))}
    </div>
  )
}

function PlatformEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Empty className="py-32">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon
            icon={FolderLibraryIcon}
            size={24}
            strokeWidth={1.5}
          />
        </EmptyMedia>
        <EmptyTitle>No projects yet</EmptyTitle>
        <EmptyDescription>
          Create the first project to give agents and users a home.
        </EmptyDescription>
      </EmptyHeader>
      <Button onClick={onCreate} className="gap-1.5">
        <Plus size={16} />
        Create project
      </Button>
    </Empty>
  )
}
