import { useMemo } from "react"
import { Spinner } from "@/components/ui/spinner"

function addLineNumbers(text: string): {
  numbered: boolean
  lines: Array<string>
} {
  const lines = text.split("\n")
  return { numbered: lines.length > 3, lines }
}

interface TerminalBlockProps {
  command?: string
  output?: string
  isRunning: boolean
  exitCode?: string | null
}

export function TerminalBlock({
  command,
  output = "",
  isRunning,
  exitCode,
}: TerminalBlockProps) {
  const hasOutput = output.length > 0
  const hasCommand = !!command
  const isSuccess = exitCode === "0"
  const isDone = !isRunning && exitCode != null

  const outputData = useMemo(
    () => (hasOutput ? addLineNumbers(output) : null),
    [hasOutput, output]
  )

  return (
    <div className="overflow-hidden rounded-md bg-inset">
      {/* Command line */}
      {hasCommand && (
        <div className="font-terminal flex items-start gap-2 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground select-none">$</span>
          <span className="flex-1 whitespace-pre-wrap text-foreground">
            {command}
          </span>
          {isRunning && (
            <Spinner className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
          )}
          {isDone && (
            <span
              className={`font-terminal shrink-0 text-2xs rounded-sm px-1.5 py-0.5 ${isSuccess ? "bg-state-completed/10 text-state-completed" : "bg-destructive/10 text-destructive"}`}
            >
              exit {exitCode}
            </span>
          )}
        </div>
      )}

      {/* Output body */}
      {hasOutput && outputData && (
        <pre
          className={`font-terminal max-h-[300px] overflow-auto text-xs leading-relaxed text-foreground/80 ${hasCommand ? "border-t border-border/20" : ""}`}
        >
          {outputData.numbered ? (
            <table className="w-full border-collapse">
              <tbody>
                {outputData.lines.map((line, i) => (
                  <tr key={i} className="hover:bg-border/5">
                    <td className="w-8 pr-3 text-right align-top text-ghost select-none">
                      {i + 1}
                    </td>
                    <td className="py-px pl-3 align-top whitespace-pre-wrap">
                      {line}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-1.5 whitespace-pre-wrap">{output}</div>
          )}
        </pre>
      )}

      {/* Running indicator when no command and no output yet */}
      {!hasCommand && !hasOutput && isRunning && (
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
