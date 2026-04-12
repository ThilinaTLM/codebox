import type { LucideIcon } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

interface ToolRunningIndicatorProps {
  icon: LucideIcon
  label: React.ReactNode
  iconSize?: number
  spinnerColor?: string
}

export function ToolRunningIndicator({
  icon: Icon,
  label,
  iconSize = 12,
  spinnerColor = "text-state-tool-use",
}: ToolRunningIndicatorProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Spinner className={`size-3 ${spinnerColor}`} />
      <Icon size={iconSize} className="text-muted-foreground" />
      <span className="font-terminal text-sm text-foreground/70">{label}</span>
    </div>
  )
}
