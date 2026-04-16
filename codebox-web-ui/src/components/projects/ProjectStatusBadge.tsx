import type { Project } from "@/net/http/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface ProjectStatusBadgeProps {
  status: Project["status"]
  className?: string
}

export function ProjectStatusBadge({
  status,
  className,
}: ProjectStatusBadgeProps) {
  if (status === "active") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-state-completed/30 bg-state-completed/10 text-xs text-state-completed",
          className
        )}
      >
        Active
      </Badge>
    )
  }
  if (status === "archived") {
    return (
      <Badge
        variant="outline"
        className={cn("text-xs text-muted-foreground", className)}
      >
        Archived
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-destructive/30 bg-destructive/10 text-xs text-destructive",
        className
      )}
    >
      Deleted
    </Badge>
  )
}
