import type { EventBlock } from "./types"
import { Spinner } from "@/components/ui/spinner"

export function ExecBlock({
  block,
}: {
  block: Extract<EventBlock, { kind: "exec_session" }>
}) {
  const hasOutput = block.output.length > 0
  const hasCommand = !!block.command
  const isSuccess = block.exitCode === "0"

  return (
    <div className="overflow-hidden rounded-xl border border-border/40">
      {/* Command header */}
      {hasCommand && (
        <div className="terminal-bg flex items-center gap-2 px-4 py-2.5 font-mono text-sm">
          <span className="select-none text-success/80">$</span>
          <span className="text-foreground/90">{block.command}</span>
          {block.isRunning && (
            <Spinner className="ml-auto size-3 text-muted-foreground" />
          )}
        </div>
      )}

      {/* Output body */}
      {hasOutput && (
        <pre
          className={`terminal-bg max-h-[400px] overflow-auto px-4 py-3 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground/80 ${hasCommand || (!hasCommand && block.exitCode != null) ? "border-t border-border/20" : ""}`}
        >
          {block.output}
        </pre>
      )}

      {/* Running indicator when no command and no output yet */}
      {!hasCommand && !hasOutput && block.isRunning && (
        <div className="terminal-bg flex items-center gap-2 px-4 py-2.5">
          <Spinner className="size-3 text-muted-foreground" />
          <span className="font-mono text-sm text-muted-foreground">
            Running...
          </span>
        </div>
      )}

      {/* Exit code footer */}
      {block.exitCode != null && (
        <div className="terminal-bg flex items-center justify-end gap-1.5 border-t border-border/20 px-4 py-1.5">
          <span className="font-mono text-xs text-muted-foreground">exit</span>
          <span
            className={`font-mono text-xs font-medium ${isSuccess ? "text-success" : "text-destructive"}`}
          >
            {block.exitCode}
          </span>
        </div>
      )}
    </div>
  )
}
