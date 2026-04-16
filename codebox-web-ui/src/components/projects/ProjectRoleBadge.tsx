import type { ProjectMember } from "@/net/http/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function ProjectRoleBadge({
  role,
  className,
}: {
  role: ProjectMember["role"]
  className?: string
}) {
  if (role === "admin") {
    return (
      <Badge variant="default" className={cn("text-xs", className)}>
        Admin
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className={cn("text-xs", className)}>
      Contributor
    </Badge>
  )
}
