import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUsers } from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { AddUserDialog } from "@/components/platform/users/AddUserDialog"
import { UsersEmptyState } from "@/components/platform/users/UsersEmptyState"
import { UsersTable } from "@/components/platform/users/UsersTable"
import { UsersTableSkeleton } from "@/components/platform/users/UsersTableSkeleton"

export const Route = createFileRoute("/platform/users")({
  component: UsersPage,
})

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