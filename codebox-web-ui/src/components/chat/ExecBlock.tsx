import { useMemo } from "react"
import type { EventBlock } from "./types"
import { Spinner } from "@/components/ui/spinner"

function addLineNumbers(text: string): { numbered: boolean; lines: Array<string> } {
  const lines = text.split("\n")
  // Only number if > 3 lines
  return { numbered: lines.length > 3, lines }
}

export function ExecBlock({
  block,
}: {
  block: Extract<EventBlock, { kind: "exec_session" }>
}) {
  const hasOutput = block.output.length > 0
  const hasCommand = !!block.command
  const isSuccess = block.exitCode === "0"
  const isDone = block.exitCode != null

  const outputData = useMemo(
    () => (hasOutput ? addLineNumbers(block.output) : null),
    [hasOutput, block.output]
  )

  return (
    <div className="overflow-hidden rounded-lg bg-inset">
      {/* Terminal header bar */}
      <div className="flex items-center gap-2 rounded-t-lg bg-card/60 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-ghost/40" />
          <span className="size-2 rounded-full bg-ghost/40" />
          <span className="size-2 rounded-full bg-ghost/40" />
        </div>
        <span className="font-terminal text-[10px] uppercase tracking-wider text-muted-foreground">
          Terminal
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {block.isRunning && (
            <Spinner className="size-3 text-muted-foreground" />
          )}
          {isDone && (
            <span
              className={`font-terminal text-xs font-medium ${isSuccess ? "text-state-completed" : "text-destructive"}`}
            >
              exit {block.exitCode}
            </span>
          )}
        </div>
      </div>

      {/* Command line */}
      {hasCommand && (
        <div className="flex items-center gap-2 border-t border-border/15 px-4 py-2.5 font-terminal text-sm">
          <span className="select-none font-terminal text-state-thinking">
            $
          </span>
          <span className="text-foreground">{block.command}</span>
        </div>
      )}

      {/* Output body */}
      {hasOutput && outputData && (
        <pre
          className={`max-h-[400px] overflow-auto font-terminal text-xs leading-relaxed text-foreground/80 ${hasCommand ? "border-t border-border/15" : ""}`}
        >
          {outputData.numbered ? (
            <table className="w-full border-collapse">
              <tbody>
                {outputData.lines.map((line, i) => (
                  <tr key={i} className="hover:bg-border/5">
                    <td className="w-8 select-none pr-3 text-right align-top text-ghost/60">
                      {i + 1}
                    </td>
                    <td className="whitespace-pre-wrap py-px pl-3 align-top">
                      {line}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-3 whitespace-pre-wrap">{block.output}</div>
          )}
        </pre>
      )}

      {/* Running indicator when no command and no output yet */}
      {!hasCommand && !hasOutput && block.isRunning && (
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Spinner className="size-3 text-muted-foreground" />
          <span className="font-terminal text-sm text-muted-foreground">
            Running...
          </span>
        </div>
      )}

      {/* Shimmer bar when running */}
      {block.isRunning && (
        <div className="h-0.5 overflow-hidden bg-state-thinking/10">
          <div className="h-full w-1/3 rounded-full bg-state-thinking/50 animate-shimmer" />
        </div>
      )}
    </div>
  )
}
