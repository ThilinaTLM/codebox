import { AlertTriangle, Circle } from "lucide-react"

export function DoneBlock() {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="h-px flex-1 bg-border/20" />
      <span className="font-terminal text-xs text-muted-foreground">
        completed
      </span>
      <div className="h-px flex-1 bg-border/20" />
    </div>
  )
}

export function ErrorBlock({ detail }: { detail: string }) {
  return (
    <div className="rounded-md border-l-2 border-l-destructive px-3 py-1.5">
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
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border/20" />
      <div className="flex items-center gap-1.5">
        <Circle
          size={6}
          className="fill-muted-foreground/40 text-muted-foreground/40"
        />
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>
      <div className="h-px flex-1 bg-border/20" />
    </div>
  )
}
