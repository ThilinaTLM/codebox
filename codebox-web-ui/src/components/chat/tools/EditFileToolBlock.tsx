import { Pencil } from "lucide-react"

import { CollapsibleToolBlock } from "./CollapsibleToolBlock"
import { ToolRunningIndicator } from "./ToolRunningIndicator"
import { parseInput } from "./types"
import type { ToolCallBlockProps } from "./types"

export function EditFileToolBlock({
  input,
  output,
  isRunning,
}: ToolCallBlockProps) {
  const args = parseInput<{
    file_path?: string
    old_string?: string
    new_string?: string
    replace_all?: boolean
  }>(input)
  const filePath = args?.file_path ?? ""
  const fileName = filePath.split("/").pop() ?? filePath
  const oldStr = args?.old_string ?? ""
  const newStr = args?.new_string ?? ""

  if (isRunning) {
    return (
      <ToolRunningIndicator
        icon={Pencil}
        iconSize={14}
        label={fileName || "file"}
        spinnerColor="text-state-writing"
      />
    )
  }

  return (
    <CollapsibleToolBlock icon={Pencil} iconSize={14} label={fileName} summary="edited">
      <p className="font-terminal pt-1 text-xs text-muted-foreground">
        {filePath}
      </p>
      {/* Diff view */}
      <div className="font-terminal mt-1 mb-0.5 overflow-auto rounded-md bg-inset text-xs leading-relaxed">
        {oldStr && (
          <div className="border-b border-border/10">
            {oldStr.split("\n").map((line, i) => (
              <div
                key={`old-${i}`}
                className="flex bg-destructive/8 px-3 py-px"
              >
                <span className="mr-2 text-destructive/50 select-none">
                  -
                </span>
                <span className="whitespace-pre-wrap text-destructive/70">
                  {line}
                </span>
              </div>
            ))}
          </div>
        )}
        {newStr && (
          <div>
            {newStr.split("\n").map((line, i) => (
              <div
                key={`new-${i}`}
                className="flex bg-state-completed/8 px-3 py-px"
              >
                <span className="mr-2 text-state-completed/50 select-none">
                  +
                </span>
                <span className="whitespace-pre-wrap text-state-completed/70">
                  {line}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {output && output.includes("Error") && (
        <p className="font-terminal mb-0.5 text-xs text-destructive/70">
          {output.slice(0, 200)}
        </p>
      )}
    </CollapsibleToolBlock>
  )
}
