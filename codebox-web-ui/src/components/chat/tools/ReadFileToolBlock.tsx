import { FileText } from "lucide-react"

import { CollapsibleToolBlock } from "./CollapsibleToolBlock"
import { ToolRunningIndicator } from "./ToolRunningIndicator"
import { parseInput } from "./types"
import type { ToolCallBlockProps } from "./types"

export function ReadFileToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const args = parseInput<{
    file_path?: string
    offset?: number
    limit?: number
  }>(input)
  const filePath = args?.file_path ?? ""
  const fileName = filePath.split("/").pop() ?? filePath
  const hasOutput = !!output && output.length > 0
  const lineCount = hasOutput ? output.split("\n").length : 0

  if (isRunning) {
    return (
      <ToolRunningIndicator icon={FileText} label={fileName || "file"} />
    )
  }

  return (
    <CollapsibleToolBlock
      icon={FileText}
      label={fileName}
      summary={hasOutput ? `${lineCount} lines` : undefined}
    >
      {filePath && (
        <p className="font-terminal pt-1 text-xs text-muted-foreground">
          {filePath}
          {args?.offset ? ` (offset: ${args.offset})` : ""}
        </p>
      )}
      {hasOutput && (
        <pre className="font-terminal mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset text-xs leading-relaxed text-foreground/80">
          <table className="w-full border-collapse">
            <tbody>
              {output.split("\n").map((line, i) => (
                <tr key={i} className="hover:bg-border/5">
                  <td className="w-8 pr-3 text-right align-top text-ghost select-none">
                    {(args?.offset ?? 0) + i + 1}
                  </td>
                  <td className="py-px pl-3 align-top whitespace-pre-wrap">
                    {line}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </pre>
      )}
    </CollapsibleToolBlock>
  )
}
