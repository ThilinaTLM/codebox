import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"

export function DoneBlock() {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-success/25" />
      <div className="flex items-center gap-1.5 text-success/70">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
        <span className="text-sm font-medium">Completed</span>
      </div>
      <div className="h-px flex-1 bg-success/25" />
    </div>
  )
}

export function ErrorBlock({ detail }: { detail: string }) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {detail}
    </div>
  )
}

export function StatusChangeBlock({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border/50" />
      <span className="text-sm text-muted-foreground">{status}</span>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  )
}
