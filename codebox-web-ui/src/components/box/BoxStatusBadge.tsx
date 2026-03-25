import { Badge } from "@/components/ui/badge"
import { BoxStatus } from "@/net/http/types"

const statusConfig: Record<
  BoxStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; animate?: boolean }
> = {
  [BoxStatus.STARTING]: { label: "Starting", variant: "outline", animate: true },
  [BoxStatus.RUNNING]: { label: "Running", variant: "default", animate: true },
  [BoxStatus.IDLE]: { label: "Idle", variant: "secondary" },
  [BoxStatus.COMPLETED]: { label: "Completed", variant: "outline" },
  [BoxStatus.FAILED]: { label: "Failed", variant: "destructive" },
  [BoxStatus.CANCELLED]: { label: "Cancelled", variant: "outline" },
  [BoxStatus.STOPPED]: { label: "Stopped", variant: "outline" },
}

const statusDot: Record<BoxStatus, string> = {
  [BoxStatus.STARTING]: "bg-warning",
  [BoxStatus.RUNNING]: "bg-success",
  [BoxStatus.IDLE]: "bg-blue-400",
  [BoxStatus.COMPLETED]: "bg-success",
  [BoxStatus.FAILED]: "bg-destructive",
  [BoxStatus.CANCELLED]: "bg-muted-foreground/40",
  [BoxStatus.STOPPED]: "bg-muted-foreground/40",
}

export function BoxStatusBadge({ status }: { status: BoxStatus }) {
  const config = statusConfig[status] ?? { label: status, variant: "outline" as const }
  const dot = statusDot[status] ?? "bg-muted-foreground/40"

  return (
    <Badge variant={config.variant} className="gap-1.5 text-xs">
      <span className="relative flex size-1.5">
        {config.animate && (
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${dot}`}
          />
        )}
        <span className={`relative inline-flex size-1.5 rounded-full ${dot}`} />
      </span>
      {config.label}
    </Badge>
  )
}
