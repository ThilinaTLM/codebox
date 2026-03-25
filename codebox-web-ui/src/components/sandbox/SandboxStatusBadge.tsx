import { Badge } from "@/components/ui/badge"
import { SandboxStatus } from "@/net/http/types"
import { cn } from "@/lib/utils"

const statusConfig: Record<
  SandboxStatus,
  { label: string; className: string; dot?: boolean }
> = {
  [SandboxStatus.STARTING]: {
    label: "Starting",
    className: "border-warning/30 bg-warning/10 text-warning",
    dot: true,
  },
  [SandboxStatus.READY]: {
    label: "Ready",
    className: "border-success/30 bg-success/10 text-success",
    dot: true,
  },
  [SandboxStatus.STOPPED]: {
    label: "Stopped",
    className: "border-muted-foreground/20 bg-muted text-muted-foreground",
  },
  [SandboxStatus.FAILED]: {
    label: "Failed",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
}

export function SandboxStatusBadge({ status }: { status: SandboxStatus }) {
  const config = statusConfig[status] ?? {
    label: status,
    className: "",
  }
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 text-xs", config.className)}
    >
      {config.dot && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {config.label}
    </Badge>
  )
}
