import { cn } from "@/lib/utils"

interface StatusDotProps {
  color: string
  animate?: boolean
  className?: string
}

export function StatusDot({ color, animate, className }: StatusDotProps) {
  return (
    <span className={cn("relative flex size-2", className)}>
      {animate && (
        <span
          className={cn("absolute inset-0 rounded-full animate-status-ping", color)}
        />
      )}
      <span className={cn("relative size-2 rounded-full", color)} />
    </span>
  )
}
