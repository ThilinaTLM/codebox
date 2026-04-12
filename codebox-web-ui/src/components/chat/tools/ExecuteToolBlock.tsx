import { TerminalBlock } from "../TerminalBlock"
import { parseInput } from "./types"
import type { ToolCallBlockProps } from "./types"

function parseExitCode(output?: string): string | null {
  if (!output) return null
  const match = output.match(
    /\[Command (?:succeeded|failed) with exit code (\d+)\]/
  )
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
  const exitCode = parseExitCode(output)

  return (
    <TerminalBlock
      command={command || undefined}
      output={displayOutput}
      isRunning={isRunning}
      exitCode={exitCode}
    />
  )
}
