import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons"
import { formatCreatedAt, getDisplayName, getInitials } from "./user-utils"
import type { AuthUser } from "@/net/http/types"
import { useDeleteUser } from "@/net/query"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCell, TableRow } from "@/components/ui/table"

export function UserRow({ user, isSelf }: { user: AuthUser; isSelf: boolean }) {
  const deleteMutation = useDeleteUser()
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(user)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{getDisplayName(user)}</span>
                {isSelf && (
                  <span className="text-xs text-muted-foreground">(you)</span>
                )}
              </div>
              {(user.first_name || user.last_name) && (
                <span className="text-xs text-muted-foreground">
                  {user.username}
                </span>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant={user.user_type === "admin" ? "default" : "secondary"}
          >
            {user.user_type}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatCreatedAt(user.created_at)}
        </TableCell>
        <TableCell>
          {!isSelf && (
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
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    size={16}
                    strokeWidth={2}
                  />
                  Delete user
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      </TableRow>
      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete User"
        description={`Are you sure you want to delete "${user.username}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          deleteMutation.mutate(user.id, {
            onSuccess: () => {
              toast.success(`User "${user.username}" deleted`)
              setConfirmDelete(false)
            },
            onError: () => toast.error("Failed to delete user"),
          })
        }}
      />
    </>
  )
}