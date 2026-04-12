import { FilePlus } from "lucide-react"

import { CollapsibleToolBlock } from "./CollapsibleToolBlock"
import { ToolRunningIndicator } from "./ToolRunningIndicator"
import { parseInput } from "./types"
import type { ToolCallBlockProps } from "./types"

export function WriteFileToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const args = parseInput<{ file_path?: string; content?: string }>(input)
  const filePath = args?.file_path ?? ""
  const fileName = filePath.split("/").pop() ?? filePath
  const content = args?.content ?? ""
  const lineCount = content ? content.split("\n").length : 0

  if (isRunning) {
    return (
      <ToolRunningIndicator
        icon={FilePlus}
        label={fileName || "file"}
        spinnerColor="text-state-writing"
      />
    )
  }

  return (
    <CollapsibleToolBlock
      icon={FilePlus}
      label={fileName}
      summary={`wrote ${lineCount} lines`}
    >
      <p className="font-terminal pt-1 text-xs text-muted-foreground">
        {filePath}
      </p>
      {content && (
        <pre className="font-terminal mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset p-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
          {content.length > 3000
            ? content.slice(0, 3000) + "\n\n… (truncated)"
            : content}
        </pre>
      )}
      {output && output.includes("Error") && (
        <p className="font-terminal mb-0.5 text-xs text-destructive/70">
          {output.slice(0, 200)}
        </p>
      )}
    </CollapsibleToolBlock>
  )
}
