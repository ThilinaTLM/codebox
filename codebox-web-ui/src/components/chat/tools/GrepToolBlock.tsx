import { Search } from "lucide-react"

import { CollapsibleToolBlock } from "./CollapsibleToolBlock"
import { ToolRunningIndicator } from "./ToolRunningIndicator"
import { parseInput } from "./types"
import type { ToolCallBlockProps } from "./types"

export function GrepToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const args = parseInput<{ pattern?: string; path?: string; glob?: string }>(
    input
  )
  const pattern = args?.pattern ?? ""
  const searchPath = args?.path ?? ""
  const hasOutput = !!output && output.length > 0

  const matchCount = hasOutput
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
        icon={Search}
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
      icon={Search}
      label={codeLabel}
      summary={`${matchCount} result${matchCount !== 1 ? "s" : ""}`}
    >
      {searchPath && (
        <p className="font-terminal pt-1 text-xs text-muted-foreground">
          in {searchPath}
        </p>
      )}
      {hasOutput && (
        <pre className="font-terminal mt-1 mb-0.5 max-h-[300px] overflow-auto rounded-md bg-inset p-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">
          {output}
        </pre>
      )}
    </CollapsibleToolBlock>
  )
}
