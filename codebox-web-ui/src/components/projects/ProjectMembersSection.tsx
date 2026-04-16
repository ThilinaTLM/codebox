import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import axios from "axios"
import { Plus } from "lucide-react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  MoreHorizontalCircle01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { AddProjectMemberDialog } from "./AddProjectMemberDialog"
import { ProjectRoleBadge } from "./ProjectRoleBadge"
import type { ProjectMember } from "@/net/http/types"
import {
  useProjectMembers,
  useRemoveProjectMember,
  useUpdateProjectMemberRole,
} from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

interface ProjectMembersSectionProps {
  projectSlug: string
  readOnly?: boolean
}

function initials(member: ProjectMember): string {
  const { first_name, last_name, username } = member.user
  if (first_name && last_name) {
    return (first_name.charAt(0) + last_name.charAt(0)).toUpperCase()
  }
  if (first_name) return first_name.charAt(0).toUpperCase()
  return username.slice(0, 2).toUpperCase()
}

function memberDisplayName(member: ProjectMember): string {
  const parts = [member.user.first_name, member.user.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : member.user.username
}

function describeError(fallback: string, err: unknown): string {
  if (
    axios.isAxiosError(err) &&
    typeof err.response?.data?.detail === "string"
  ) {
    return err.response.data.detail
  }
  return fallback
}

export function ProjectMembersSection({
  projectSlug,
  readOnly = false,
}: ProjectMembersSectionProps) {
  const { data: members, isLoading } = useProjectMembers(projectSlug)
  const [addOpen, setAddOpen] = useState(false)
  const currentUserId = useAuthStore((s) => s.user?.id ?? null)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg">Members</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Control who can access this project and what they can do.
          </p>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="gap-1.5"
          >
            <Plus size={14} />
            Add member
          </Button>
        )}
      </div>

      {isLoading ? (
        <MembersSkeleton />
      ) : !members || members.length === 0 ? (
        <MembersEmptyState
          readOnly={readOnly}
          onAdd={() => setAddOpen(true)}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <MemberRow
                key={m.id}
                projectSlug={projectSlug}
                member={m}
                readOnly={readOnly}
                isSelf={m.user_id === currentUserId}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <AddProjectMemberDialog
        projectSlug={projectSlug}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  )
}

function MemberRow({
  projectSlug,
  member,
  readOnly,
  isSelf,
}: {
  projectSlug: string
  member: ProjectMember
  readOnly: boolean
  isSelf: boolean
}) {
  const updateMutation = useUpdateProjectMemberRole(projectSlug)
  const removeMutation = useRemoveProjectMember(projectSlug)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const promoteOrDemote = () => {
    const nextRole = member.role === "admin" ? "contributor" : "admin"
    updateMutation.mutate(
      { userId: member.user_id, role: nextRole },
      {
        onSuccess: () => {
          toast.success(
            `${member.user.username} is now ${
              nextRole === "admin" ? "a project admin" : "a contributor"
            }`
          )
        },
        onError: (err) =>
          toast.error(describeError("Failed to update role", err)),
      }
    )
  }

  const doRemove = () => {
    removeMutation.mutate(member.user_id, {
      onSuccess: () => {
        toast.success(`Removed ${member.user.username}`)
        setConfirmRemove(false)
      },
      onError: (err) =>
        toast.error(describeError("Failed to remove member", err)),
    })
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>{initials(member)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{memberDisplayName(member)}</span>
                {isSelf && (
                  <span className="text-xs text-muted-foreground">(you)</span>
                )}
              </div>
              {(member.user.first_name || member.user.last_name) && (
                <span className="text-xs text-muted-foreground">
                  {member.user.username}
                </span>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <ProjectRoleBadge role={member.role} />
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatDistanceToNow(new Date(member.created_at), {
            addSuffix: true,
          })}
        </TableCell>
        <TableCell>
          {!readOnly && (
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
                <DropdownMenuItem
                  onClick={promoteOrDemote}
                  disabled={updateMutation.isPending}
                >
                  {member.role === "admin"
                    ? "Demote to contributor"
                    : "Promote to admin"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmRemove(true)}
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    size={16}
                    strokeWidth={2}
                  />
                  Remove from project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      </TableRow>

      <ConfirmActionDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove member"
        description={`Remove ${member.user.username} from this project?`}
        confirmLabel="Remove"
        confirmVariant="destructive"
        isPending={removeMutation.isPending}
        onConfirm={doRemove}
      />
    </>
  )
}

function MembersSkeleton() {
  return (
    <div className="space-y-3 pt-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <Skeleton className="h-3 w-32 rounded" />
          <Skeleton className="ml-4 h-5 w-20 rounded-full" />
          <Skeleton className="ml-auto h-3 w-20 rounded" />
        </div>
      ))}
    </div>
  )
}

function MembersEmptyState({
  readOnly,
  onAdd,
}: {
  readOnly: boolean
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <HugeiconsIcon
        icon={UserGroupIcon}
        size={24}
        strokeWidth={1.5}
        className="mb-3 text-muted-foreground"
      />
      <h3 className="font-display text-base">No members yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {readOnly
          ? "A project admin can add members."
          : "Add your teammates so they can collaborate on this project."}
      </p>
      {!readOnly && (
        <Button onClick={onAdd} className="mt-4 gap-1.5">
          <Plus size={16} />
          Add member
        </Button>
      )}
    </div>
  )
}
