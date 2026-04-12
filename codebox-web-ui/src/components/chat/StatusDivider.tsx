import { AlertTriangle } from "lucide-react"

export function DoneBlock() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border/30" />
      <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1">
        <span className="size-1.5 rounded-full bg-state-completed" />
        <span className="text-2xs font-medium text-muted-foreground">
          Completed
        </span>
      </div>
      <div className="h-px flex-1 bg-border/30" />
    </div>
  )
}

export function ErrorBlock({ detail }: { detail: string }) {
  return (
    <div className="rounded-md border-l-4 border-l-destructive bg-destructive/5 px-3 py-1.5">
      <div className="mb-0.5 flex items-center gap-1.5">
        <AlertTriangle size={12} className="text-destructive" />
        <span className="text-xs font-medium text-destructive">Error</span>
      </div>
      <p className="text-sm text-destructive/80">{detail}</p>
    </div>
  )
}

export function StatusChangeBlock({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-border/30" />
      <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1">
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="text-2xs font-medium text-muted-foreground">
          {status}
        </span>
      </div>
      <div className="h-px flex-1 bg-border/30" />
    </div>
  )
}
