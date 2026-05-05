import { UserRow } from "./UserRow"
import type { AuthUser } from "@/net/http/types"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function UsersTable({
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