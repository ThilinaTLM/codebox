import { TerminalBlock } from "./TerminalBlock"
import type { EventBlock } from "./types"

export function ExecBlock({
  block,
}: {
  block: Extract<EventBlock, { kind: "exec_session" }>
}) {
  return (
    <TerminalBlock
      command={block.command || undefined}
      output={block.output}
      isRunning={block.isRunning}
      exitCode={block.exitCode}
    />
  )
}
