import { useMemo } from "react"
import type { EventBlock } from "./types"
import { Spinner } from "@/components/ui/spinner"

function addLineNumbers(text: string): { numbered: boolean; lines: Array<string> } {
  const lines = text.split("\n")
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
    <div className="overflow-hidden rounded-md bg-inset">
      {/* Command line */}
      {hasCommand && (
        <div className="flex items-start gap-2 px-3 py-1.5 font-terminal text-sm">
          <span className="select-none text-muted-foreground">$</span>
          <span className="flex-1 whitespace-pre-wrap text-foreground">{block.command}</span>
          {block.isRunning && <Spinner className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
          {isDone && (
            <span
              className={`shrink-0 font-terminal text-xs ${isSuccess ? "text-muted-foreground" : "text-destructive"}`}
            >
              exit {block.exitCode}
            </span>
          )}
        </div>
      )}

      {/* Output body */}
      {hasOutput && outputData && (
        <pre
          className={`max-h-[300px] overflow-auto font-terminal text-xs leading-relaxed text-foreground/80 ${hasCommand ? "border-t border-border/15" : ""}`}
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
            <div className="px-3 py-1.5 whitespace-pre-wrap">{block.output}</div>
          )}
        </pre>
      )}

      {/* Running indicator when no command and no output yet */}
      {!hasCommand && !hasOutput && block.isRunning && (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <Spinner className="size-3 text-muted-foreground" />
          <span className="font-terminal text-sm text-muted-foreground">
            Running…
          </span>
        </div>
      )}
    </div>
  )
}
