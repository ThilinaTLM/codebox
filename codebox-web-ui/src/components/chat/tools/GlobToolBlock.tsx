import { FolderSearch } from "lucide-react"

import { CollapsibleToolBlock } from "./CollapsibleToolBlock"
import { ToolRunningIndicator } from "./ToolRunningIndicator"
import { parseInput } from "./types"
import type { ToolCallBlockProps } from "./types"

export function GlobToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const args = parseInput<{ pattern?: string; path?: string }>(input)
  const pattern = args?.pattern ?? ""
  const searchPath = args?.path ?? ""
  const hasOutput = !!output && output.length > 0
  const fileCount = hasOutput
    ? output.split("\n").filter((l) => l.trim()).length
    : 0

  const codeLabel = (
    <code className="font-terminal rounded border border-border/20 bg-inset px-1.5 py-0.5 text-xs text-foreground/70">
      {pattern}
    </code>
  )

  if (isRunning) {
    return (
      <ToolRunningIndicator
        icon={FolderSearch}
        label={
          <code className="rounded border border-border/20 bg-inset px-1">
            {pattern}
          </code>
        }
      />
    )
  }

  return (
    <CollapsibleToolBlock
      icon={FolderSearch}
      label={codeLabel}
      summary={`${fileCount} file${fileCount !== 1 ? "s" : ""}`}
    >
      {searchPath && (
        <p className="font-terminal pt-1 text-xs text-muted-foreground">
          in {searchPath}
        </p>
      )}
      {hasOutput && (
        <div className="mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset p-2">
          {output
            .split("\n")
            .filter((l) => l.trim())
            .map((file, i) => (
              <div
                key={i}
                className="font-terminal py-0.5 text-xs text-foreground/80 hover:text-primary"
              >
                {file}
              </div>
            ))}
        </div>
      )}
    </CollapsibleToolBlock>
  )
}
