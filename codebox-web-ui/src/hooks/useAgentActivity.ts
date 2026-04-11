import { useMemo } from "react"
import type { BoxStreamEvent } from "@/net/http/types"
import { Activity, ContainerStatus } from "@/net/http/types"

export interface AgentActivity {
  label: string
  animate: boolean
  dotColor: string
  isWorking: boolean
}

export function useAgentActivity(
  events: Array<BoxStreamEvent>,
  containerStatus: ContainerStatus | undefined,
  activity: Activity | undefined
): AgentActivity {
  return useMemo(() => {
    if (!containerStatus || containerStatus === ContainerStatus.STARTING) {
      return {
        label: "Starting",
        animate: true,
        dotColor: "bg-warning",
        isWorking: false,
      }
    }

    if (containerStatus === ContainerStatus.STOPPED) {
      return {
        label: "Stopped",
        animate: false,
        dotColor: "bg-muted-foreground/40",
        isWorking: false,
      }
    }

    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      switch (ev.kind) {
        case "reasoning.started":
        case "reasoning.delta":
        case "turn.started":
          return {
            label: "Thinking",
            animate: true,
            dotColor: "bg-primary/70",
            isWorking: true,
          }
        case "message.delta":
          return {
            label: "Writing",
            animate: true,
            dotColor: "bg-success",
            isWorking: true,
          }
        case "tool_call.started":
          return {
            label: `Using ${String(ev.payload.name ?? "tool")}`,
            animate: true,
            dotColor: "bg-warning",
            isWorking: true,
          }
        case "command.started":
          return {
            label: "Running command",
            animate: true,
            dotColor: "bg-warning",
            isWorking: true,
          }
        case "run.completed":
          return {
            label: "Idle",
            animate: false,
            dotColor: "bg-muted-foreground/60",
            isWorking: false,
          }
        case "run.failed":
          return {
            label: "Error",
            animate: false,
            dotColor: "bg-destructive",
            isWorking: false,
          }
        case "state.changed": {
          const nextActivity = ev.payload.activity as Activity | undefined
          if (nextActivity === Activity.AGENT_WORKING) {
            return {
              label: "Working",
              animate: true,
              dotColor: "bg-success",
              isWorking: true,
            }
          }
          if (nextActivity === Activity.EXEC_SHELL) {
            return {
              label: "Running command",
              animate: true,
              dotColor: "bg-warning",
              isWorking: true,
            }
          }
          return {
            label: "Idle",
            animate: false,
            dotColor: "bg-muted-foreground/60",
            isWorking: false,
          }
        }
      }
    }

    if (activity === Activity.AGENT_WORKING) {
      return {
        label: "Working",
        animate: true,
        dotColor: "bg-success",
        isWorking: true,
      }
    }
    if (activity === Activity.EXEC_SHELL) {
      return {
        label: "Running command",
        animate: true,
        dotColor: "bg-warning",
        isWorking: true,
      }
    }
    return {
      label: "Idle",
      animate: false,
      dotColor: "bg-muted-foreground/60",
      isWorking: false,
    }
  }, [events, containerStatus, activity])
}
