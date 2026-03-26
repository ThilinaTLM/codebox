import { CheckCircle2, AlertTriangle, Circle } from "lucide-react"

export function DoneBlock() {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="h-px flex-1 bg-state-completed/15" />
      <div className="flex items-center gap-1.5">
        <CheckCircle2 size={14} className="text-state-completed/80" />
        <span className="font-terminal text-xs text-state-completed/60">
          Completed
        </span>
      </div>
      <div className="h-px flex-1 bg-state-completed/15" />
    </div>
  )
}

export function ErrorBlock({ detail }: { detail: string }) {
  return (
    <div className="rounded-lg border border-state-error/20 border-l-2 border-l-state-error bg-state-error/5 px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5">
        <AlertTriangle size={12} className="text-state-error/80" />
        <span className="font-terminal text-xs text-state-error/60">Error</span>
      </div>
      <p className="text-sm text-state-error">{detail}</p>
    </div>
  )
}

export function StatusChangeBlock({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="h-px flex-1 bg-border/30" />
      <div className="flex items-center gap-1.5">
        <Circle size={6} className="fill-ghost/40 text-ghost/40" />
        <span className="font-terminal text-xs text-ghost">{status}</span>
      </div>
      <div className="h-px flex-1 bg-border/30" />
    </div>
  )
}
