import type { AgentState } from "@/hooks/useAgentActivity"

const STATE_BAR_COLORS: Record<AgentState, string> = {
  thinking: "from-state-thinking",
  writing: "from-state-writing",
  "tool-use": "from-state-tool-use",
  idle: "from-border",
  error: "from-state-error",
  completed: "from-state-completed",
  starting: "from-state-starting",
  stopped: "from-border",
}

interface ActivityBarProps {
  activity: {
    label: string
    animate: boolean
    state: AgentState
    isWorking: boolean
  }
}

export function ActivityBar({ activity }: ActivityBarProps) {
  return (
    <div
      className={`w-full overflow-hidden transition-all duration-slow ${
        activity.isWorking ? "h-[3px]" : "h-0"
      }`}
    >
      <div
        className={`h-full w-full bg-gradient-to-r ${STATE_BAR_COLORS[activity.state]} to-transparent transition-all duration-300 ease-in-out ${
          activity.animate ? "animate-glow-pulse" : ""
        }`}
      />
    </div>
  )
}
