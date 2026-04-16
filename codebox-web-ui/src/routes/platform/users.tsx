import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  MoreHorizontalCircle01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import type { AuthUser } from "@/net/http/types"
import { useCreateUser, useDeleteUser, useUsers } from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const Route = createFileRoute("/platform/users")({
  component: UsersPage,
})

// ── Helpers ─────────────────────────────────────────────────

function getInitials(user: AuthUser): string {
  if (user.first_name && user.last_name) {
    return (
      user.first_name.charAt(0) + user.last_name.charAt(0)
    ).toUpperCase()
  }
  if (user.first_name) {
    return user.first_name.charAt(0).toUpperCase()
  }
  return user.username.slice(0, 2).toUpperCase()
}

function getDisplayName(user: AuthUser): string {
  const parts = [user.first_name, user.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : user.username
}

function formatCreatedAt(dateStr: string | undefined): string {
  if (!dateStr) return ""
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

// ── Page ────────────────────────────────────────────────────

function UsersPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const isAdmin = user?.user_type === "admin"
  const { data: users = [], isLoading } = useUsers()
  const [addDialogOpen, setAddDialogOpen] = useState(false)

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
            Users
          </h1>
          {!isLoading && users.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              {users.length}
            </span>
          )}
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          className="gap-1.5"
        >
          <Plus size={16} />
          New User
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl">
          {isLoading ? (
            <UsersTableSkeleton />
          ) : users.length === 0 ? (
            <UsersEmptyState onAdd={() => setAddDialogOpen(true)} />
          ) : (
            <UsersTable users={users} currentUserId={user.id} />
          )}
        </div>
      </div>

      <AddUserDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </div>
  )
}

// ── Add User Dialog ─────────────────────────────────────────

function AddUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [userType, setUserType] = useState<"user" | "admin">("user")
  const createMutation = useCreateUser()

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setUsername("")
      setPassword("")
      setFirstName("")
      setLastName("")
      setUserType("user")
    }
    onOpenChange(next)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    if (password.length < 4) {
      toast.error("Password must be at least 4 characters")
      return
    }
    createMutation.mutate(
      {
        username,
        password,
        userType,
        firstName: firstName || null,
        lastName: lastName || null,
      },
      {
        onSuccess: () => {
          toast.success(`User "${username}" created`)
          onOpenChange(false)
        },
        onError: () =>
          toast.error("Failed to create user. Username may already exist."),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Add a new user account with a username and password.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-first-name">First name</Label>
              <Input
                id="new-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-last-name">Last name</Label>
              <Input
                id="new-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-password">Password</Label>
            <Input
              id="new-user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={userType === "user" ? "default" : "outline"}
                onClick={() => setUserType("user")}
              >
                User
              </Button>
              <Button
                type="button"
                size="sm"
                variant={userType === "admin" ? "default" : "outline"}
                onClick={() => setUserType("admin")}
              >
                Admin
              </Button>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              disabled={
                createMutation.isPending || !username || !password
              }
            >
              {createMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Users Table ─────────────────────────────────────────────

function UsersTable({
  users,
  currentUserId,
}: {
  users: Array<AuthUser>
  currentUserId: string | undefined
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isSelf={u.id === currentUserId}
          />
        ))}
      </TableBody>
    </Table>
  )
}

function UserRow({ user, isSelf }: { user: AuthUser; isSelf: boolean }) {
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

// ── Loading Skeleton ────────────────────────────────────────

function UsersTableSkeleton() {
  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-8 px-3">
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-3 w-10 rounded" />
        <Skeleton className="h-3 w-14 rounded" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="ml-4 h-5 w-14 rounded-full" />
          <Skeleton className="ml-auto h-3 w-20 rounded" />
        </div>
      ))}
    </div>
  )
}

// ── Empty State ─────────────────────────────────────────────

function UsersEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Empty className="py-32">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon
            icon={UserGroupIcon}
            size={24}
            strokeWidth={1.5}
          />
        </EmptyMedia>
        <EmptyTitle>No users yet</EmptyTitle>
        <EmptyDescription>
          Create the first user account to get started.
        </EmptyDescription>
      </EmptyHeader>
      <Button onClick={onAdd} className="gap-1.5">
        <Plus size={16} />
        Create User
      </Button>
    </Empty>
  )
}
