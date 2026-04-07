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
  const args = parseInput<{ command?: string; timeout?: number }>(input)
  const command = args?.command ?? ""
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
    <div className="overflow-hidden rounded-md bg-inset">
      {/* Command line */}
      {command && (
        <div className="flex items-start gap-2 px-3 py-1.5 font-terminal text-sm">
          <span className="select-none text-muted-foreground">$</span>
          <span className="flex-1 whitespace-pre-wrap text-foreground">{command}</span>
          {isRunning && <Spinner className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
          {isDone && (
            <span
              className={`shrink-0 font-terminal text-xs ${isSuccess ? "text-muted-foreground" : "text-destructive"}`}
            >
              exit {exitCode}
            </span>
          )}
        </div>
      )}

      {/* Output body */}
      {hasOutput && outputData && (
        <pre
          className={`max-h-[300px] overflow-auto font-terminal text-xs leading-relaxed text-foreground/80 ${command ? "border-t border-border/15" : ""}`}
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
            <div className="px-3 py-1.5 whitespace-pre-wrap">{displayOutput}</div>
          )}
        </pre>
      )}

      {/* Running indicator when no command and no output yet */}
      {!command && !hasOutput && isRunning && (
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
