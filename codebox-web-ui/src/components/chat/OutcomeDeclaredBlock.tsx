import { AlertCircle, CheckCircle, Info, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface OutcomeDeclaredBlockProps {
  status: string
  message: string
}

const STATUS_CONFIG: Record<
  string,
  { heading: string; borderColor: string; bgColor: string; icon: typeof CheckCircle }
> = {
  completed: {
    heading: "Agent completed",
    borderColor: "border-state-completed/40",
    bgColor: "bg-state-completed/5",
    icon: CheckCircle,
  },
  need_clarification: {
    heading: "Agent needs clarification",
    borderColor: "border-warning/40",
    bgColor: "bg-warning/5",
    icon: AlertCircle,
  },
  unable_to_proceed: {
    heading: "Agent unable to proceed",
    borderColor: "border-state-error/40",
    bgColor: "bg-state-error/5",
    icon: XCircle,
  },
  not_enough_context: {
    heading: "Agent needs more context",
    borderColor: "border-warning/40",
    bgColor: "bg-warning/5",
    icon: Info,
  },
}

const DEFAULT_CONFIG = {
  heading: "Outcome declared",
  borderColor: "border-border/40",
  bgColor: "bg-muted/5",
  icon: Info,
}

export function OutcomeDeclaredBlock({ status, message }: OutcomeDeclaredBlockProps) {
  const config = STATUS_CONFIG[status] ?? DEFAULT_CONFIG
  const Icon = config.icon

  return (
    <div
      className={cn(
        "mx-auto max-w-2xl rounded-lg border px-4 py-3",
        config.borderColor,
        config.bgColor
      )}
    >
      <div className="flex items-center gap-2">
        <Icon size={16} className="shrink-0" />
        <span className="text-sm font-medium">{config.heading}</span>
      </div>
      {message && (
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  )
}
