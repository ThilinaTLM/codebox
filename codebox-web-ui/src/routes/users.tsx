import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { AuthUser } from "@/net/http/types"
import { useCreateUser, useDeleteUser, useUsers } from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const Route = createFileRoute("/users")({
  component: UsersPage,
})

function UsersPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const isAdmin = user?.user_type === "admin"
  const { data: users = [], isLoading } = useUsers()

  useEffect(() => {
    if (!isAdmin) {
      navigate({ to: "/" })
    }
  }, [isAdmin, navigate])

  if (!isAdmin) return null

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col overflow-y-auto">
      <div className="px-6 pt-8 pb-2">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Users
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage user accounts and roles.
          </p>
        </div>
      </div>

      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto mt-6 max-w-6xl space-y-10">
          <AddUserSection />
          <UsersList users={users} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )
}

// ── Add User ────────────────────────────────────────────────

function AddUserSection() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [userType, setUserType] = useState<"user" | "admin">("user")
  const createUserMutation = useCreateUser()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    if (password.length < 4) {
      toast.error("Password must be at least 4 characters")
      return
    }
    createUserMutation.mutate(
      { username, password, userType },
      {
        onSuccess: () => {
          toast.success(`User "${username}" created`)
          setUsername("")
          setPassword("")
          setUserType("user")
        },
        onError: () =>
          toast.error("Failed to create user. Username may already exist."),
      }
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg font-semibold">Add User</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Create a new user account. Users can only be created by admins.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 max-w-md space-y-3">
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
          <Label htmlFor="new-user-type">Role</Label>
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
        <Button
          type="submit"
          size="sm"
          disabled={createUserMutation.isPending || !username || !password}
        >
          {createUserMutation.isPending ? "Creating..." : "Create user"}
        </Button>
      </form>
    </section>
  )
}

// ── User List ───────────────────────────────────────────────

function UsersList({
  users,
  isLoading,
}: {
  users: Array<AuthUser>
  isLoading: boolean
}) {
  const currentUser = useAuthStore((s) => s.user)

  if (isLoading) {
    return (
      <section>
        <h2 className="font-display text-lg font-semibold">All Users</h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg font-semibold">All Users</h2>
      {users.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No users found.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {users.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === currentUser?.id} />
          ))}
        </div>
      )}
    </section>
  )
}

function UserRow({ user, isSelf }: { user: AuthUser; isSelf: boolean }) {
  const deleteMutation = useDeleteUser()

  const handleDelete = () => {
    if (!confirm(`Delete user "${user.username}"?`)) return
    deleteMutation.mutate(user.id, {
      onSuccess: () => toast.success(`User "${user.username}" deleted`),
      onError: () => toast.error("Failed to delete user"),
    })
  }

  return (
    <Card className="rounded-lg border-border bg-card">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="font-display font-semibold">{user.username}</span>
          <Badge variant="outline" className="font-terminal text-xs">
            {user.user_type}
          </Badge>
          {isSelf && (
            <span className="text-xs text-muted-foreground">(you)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-terminal text-xs text-muted-foreground">
            {user.created_at
              ? new Date(user.created_at).toLocaleDateString()
              : ""}
          </span>
          {!isSelf && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
