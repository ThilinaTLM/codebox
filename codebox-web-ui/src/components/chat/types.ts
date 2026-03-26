export type EventBlock =
  | { kind: "text"; content: string }
  | { kind: "thinking" }
  | {
      kind: "tool_call"
      name: string
      input?: string
      output?: string
      isRunning: boolean
    }
  | { kind: "done"; content: string }
  | { kind: "error"; detail: string }
  | { kind: "status_change"; status: string }
  | {
      kind: "exec_session"
      command?: string
      output: string
      exitCode?: string
      isRunning: boolean
    }
  | { kind: "user_message"; content: string }
