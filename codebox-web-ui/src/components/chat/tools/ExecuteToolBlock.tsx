import { useMemo } from "react"
import { Spinner } from "@/components/ui/spinner"
import type { ToolCallBlockProps } from "./types"
import { parseInput } from "./types"

function addLineNumbers(text: string) {
  const lines = text.split("\n")
  return { numbered: lines.length > 3, lines }
}

function parseExitCode(output?: string): string | null {
  if (!output) return null
  const match = output.match(/\[Command (?:succeeded|failed) with exit code (\d+)\]/)
  if (match) return match[1]
  const exitMatch = output.match(/Exit code: (\d+)/)
  if (exitMatch) return exitMatch[1]
  return null
}

export function ExecuteToolBlock({
  input,
  output,
  streamOutput,
  isRunning,
}: ToolCallBlockProps) {
  const args = parseInput<{ command?: string }>(input)
  const command = args?.command ?? input ?? ""
  const displayOutput = streamOutput || output || ""
  const hasOutput = displayOutput.length > 0
  const exitCode = parseExitCode(output)
  const isSuccess = exitCode === "0"
  const isDone = !isRunning && exitCode != null

  const outputData = useMemo(
    () => (hasOutput ? addLineNumbers(displayOutput) : null),
    [hasOutput, displayOutput],
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
        <span className="rounded bg-state-tool-use/10 px-1.5 py-0.5 font-terminal text-[10px] uppercase tracking-wider text-state-tool-use/70">
          execute
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {isRunning && <Spinner className="size-3 text-muted-foreground" />}
          {isDone && (
            <span
              className={`font-terminal text-xs font-medium ${isSuccess ? "text-state-completed" : "text-destructive"}`}
            >
              exit {exitCode}
            </span>
          )}
        </div>
      </div>

      {/* Command line */}
      {command && (
        <div className="flex items-start gap-2 border-t border-border/15 px-4 py-2.5 font-terminal text-sm">
          <span className="select-none text-state-thinking">$</span>
          <span className="whitespace-pre-wrap text-foreground">{command}</span>
        </div>
      )}

      {/* Output body */}
      {hasOutput && outputData && (
        <pre
          className={`max-h-[400px] overflow-auto font-terminal text-xs leading-relaxed text-foreground/80 ${command ? "border-t border-border/15" : ""}`}
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
            <div className="px-4 py-3 whitespace-pre-wrap">{displayOutput}</div>
          )}
        </pre>
      )}

      {/* Running indicator when no output yet */}
      {!hasOutput && isRunning && (
        <div className="flex items-center gap-2 border-t border-border/15 px-4 py-2.5">
          <Spinner className="size-3 text-muted-foreground" />
          <span className="font-terminal text-sm text-muted-foreground">
            Running...
          </span>
        </div>
      )}

      {/* Shimmer bar when running */}
      {isRunning && (
        <div className="h-0.5 overflow-hidden bg-state-tool-use/10">
          <div className="h-full w-1/3 rounded-full bg-state-tool-use/50 animate-shimmer" />
        </div>
      )}
    </div>
  )
}
