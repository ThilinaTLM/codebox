import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import axios from "axios"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Archive02Icon,
  Delete02Icon,
  Edit02Icon,
  FolderOpenIcon,
  MoreHorizontalCircle01Icon,
  PackageReceiveIcon,
} from "@hugeicons/core-free-icons"
import type { Project } from "@/net/http/types"
import {
  useArchiveProject,
  useDeleteProject,
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
import { TableCell, TableRow } from "@/components/ui/table"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import { EditProjectDialog } from "@/components/projects/EditProjectDialog"
import { ProjectStatusBadge } from "@/components/projects/ProjectStatusBadge"

function describeError(fallback: string, err: unknown): string {
  if (
    axios.isAxiosError(err) &&
    typeof err.response?.data?.detail === "string"
  ) {
    return err.response.data.detail
  }
  return fallback
}

export function ProjectRow({ project }: { project: Project }) {
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