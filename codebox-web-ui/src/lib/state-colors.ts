import type { AgentState } from "@/hooks/useAgentActivity"

export const STATE_DOT_COLORS: Record<AgentState, string> = {
  thinking: "bg-state-thinking",
  writing: "bg-state-writing",
  "tool-use": "bg-state-tool-use",
  idle: "bg-state-idle",
  error: "bg-state-error",
  completed: "bg-state-completed",
  starting: "bg-state-starting",
  stopped: "bg-muted-foreground/40",
}

export const STATE_GLOW_CLASSES: Record<AgentState, string> = {
  thinking: "glow-thinking",
  writing: "glow-writing",
  "tool-use": "glow-tool-use",
  idle: "",
  error: "glow-error",
  completed: "glow-completed",
  starting: "glow-thinking",
  stopped: "",
}
