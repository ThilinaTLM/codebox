import { Plus } from "lucide-react"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserGroupIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function UsersEmptyState({ onAdd }: { onAdd: () => void }) {
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