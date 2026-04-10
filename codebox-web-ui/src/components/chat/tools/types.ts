export interface ToolCallBlockProps {
  name: string
  toolCallId?: string
  input?: string
  output?: string
  streamOutput?: string
  isRunning: boolean
}

/** Safely parse a JSON string, returning null on failure. */
export function parseInput<T = Record<string, unknown>>(
  input?: string
): T | null {
  if (!input) return null
  try {
    return JSON.parse(input) as T
  } catch {
    return null
  }
}
