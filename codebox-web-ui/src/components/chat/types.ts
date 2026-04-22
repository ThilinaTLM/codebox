export type EventBlock =
  | { kind: "text"; content: string }
  | { kind: "thinking"; content?: string; isStreaming?: boolean }
  | {
      kind: "tool_call"
      name: string
      toolCallId?: string
      input?: string
      output?: string
      streamOutput?: string
      isRunning: boolean
    }
  | { kind: "done"; content: string }
  | { kind: "error"; detail: string }
  | { kind: "status_change"; status: string }
  | { kind: "user_message"; content: string }
  | {
      kind: "input_requested"
      message: string
      questions?: Array<string>
      timestamp_ms?: number
    }
