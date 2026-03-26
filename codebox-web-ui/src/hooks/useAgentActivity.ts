import { useMemo } from "react"
import type { WSEvent } from "@/net/http/types"
import { ContainerStatus, TaskStatus } from "@/net/http/types"

export interface AgentActivity {
  label: string
  animate: boolean
  dotColor: string
  isWorking: boolean
}

export function useAgentActivity(
  events: Array<WSEvent>,
  containerStatus: ContainerStatus | undefined,
  taskStatus: TaskStatus | undefined
): AgentActivity {
  return useMemo(() => {
    if (!containerStatus || containerStatus === ContainerStatus.STARTING) {
      return { label: "Starting", animate: true, dotColor: "bg-warning", isWorking: false }
    }

    if (containerStatus === ContainerStatus.STOPPED) {
      return { label: "Stopped", animate: false, dotColor: "bg-muted-foreground/40", isWorking: false }
    }

    // For RUNNING containers, scan events backwards for latest activity signal
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      switch (ev.type) {
        case "model_start":
          return { label: "Thinking", animate: true, dotColor: "bg-primary/70", isWorking: true }
        case "token":
          return { label: "Writing", animate: true, dotColor: "bg-success", isWorking: true }
        case "tool_start":
          return {
            label: `Using ${ev.name}`,
            animate: true,
            dotColor: "bg-warning",
            isWorking: true,
          }
        case "tool_end":
          return { label: "Thinking", animate: true, dotColor: "bg-primary/70", isWorking: true }
        case "done":
          return {
            label: "Idle",
            animate: false,
            dotColor: "bg-muted-foreground/60",
            isWorking: false,
          }
        case "error":
          return { label: "Error", animate: false, dotColor: "bg-destructive", isWorking: false }
        case "task_status_changed":
          if (ev.status === TaskStatus.AGENT_WORKING) {
            return { label: "Working", animate: true, dotColor: "bg-success", isWorking: true }
          }
          if (ev.status === TaskStatus.EXEC_SHELL) {
            return { label: "Running command", animate: true, dotColor: "bg-warning", isWorking: true }
          }
          if (ev.status === TaskStatus.IDLE) {
            return { label: "Idle", animate: false, dotColor: "bg-muted-foreground/60", isWorking: false }
          }
          break
        case "status_change":
          if (ev.container_status === ContainerStatus.STOPPED) {
            return { label: "Stopped", animate: false, dotColor: "bg-muted-foreground/40", isWorking: false }
          }
          break
      }
    }

    // Fallback based on task status
    if (taskStatus === TaskStatus.AGENT_WORKING) {
      return { label: "Working", animate: true, dotColor: "bg-success", isWorking: true }
    }
    if (taskStatus === TaskStatus.EXEC_SHELL) {
      return { label: "Running command", animate: true, dotColor: "bg-warning", isWorking: true }
    }
    return {
      label: "Idle",
      animate: false,
      dotColor: "bg-muted-foreground/60",
      isWorking: false,
    }
  }, [events, containerStatus, taskStatus])
}
