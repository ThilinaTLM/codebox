import { useMemo } from "react"
import type { WSEvent } from "@/net/http/types"
import { BoxStatus } from "@/net/http/types"

export interface AgentActivity {
  label: string
  animate: boolean
  dotColor: string
}

const terminalActivities: Partial<Record<BoxStatus, AgentActivity>> = {
  [BoxStatus.COMPLETED]: { label: "Completed", animate: false, dotColor: "bg-success" },
  [BoxStatus.FAILED]: { label: "Failed", animate: false, dotColor: "bg-destructive" },
  [BoxStatus.CANCELLED]: { label: "Cancelled", animate: false, dotColor: "bg-muted-foreground/40" },
  [BoxStatus.STOPPED]: { label: "Stopped", animate: false, dotColor: "bg-muted-foreground/40" },
}

export function useAgentActivity(
  events: WSEvent[],
  boxStatus: BoxStatus | undefined,
): AgentActivity {
  return useMemo(() => {
    if (!boxStatus || boxStatus === BoxStatus.STARTING) {
      return { label: "Starting", animate: true, dotColor: "bg-warning" }
    }

    const terminal = terminalActivities[boxStatus]
    if (terminal) return terminal

    // For RUNNING / IDLE, scan events backwards for latest activity signal
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      switch (ev.type) {
        case "model_start":
          return { label: "Thinking", animate: true, dotColor: "bg-violet-400" }
        case "token":
          return { label: "Writing", animate: true, dotColor: "bg-success" }
        case "tool_start":
          return { label: `Using ${ev.name}`, animate: true, dotColor: "bg-amber-400" }
        case "tool_end":
          return { label: "Thinking", animate: true, dotColor: "bg-violet-400" }
        case "done":
          return { label: "Idle", animate: false, dotColor: "bg-blue-400" }
        case "error":
          return { label: "Error", animate: false, dotColor: "bg-destructive" }
        case "status_change":
          if (ev.status === BoxStatus.IDLE) {
            return { label: "Idle", animate: false, dotColor: "bg-blue-400" }
          }
          if (ev.status === BoxStatus.RUNNING) {
            return { label: "Running", animate: true, dotColor: "bg-success" }
          }
          break
      }
    }

    // Fallback
    if (boxStatus === BoxStatus.IDLE) {
      return { label: "Idle", animate: false, dotColor: "bg-blue-400" }
    }
    return { label: "Running", animate: true, dotColor: "bg-success" }
  }, [events, boxStatus])
}
