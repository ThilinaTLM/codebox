import { Plus } from "lucide-react"
import { HugeiconsIcon } from "@hugeicons/react"
import { FolderLibraryIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function PlatformEmptyState({ onCreate }: { onCreate: () => void }) {
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