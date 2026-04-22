import { formatDistanceToNow } from "date-fns"
import type { Box } from "@/net/http/types"
import { Activity, BoxOutcome, ContainerStatus } from "@/net/http/types"

export function isBoxActive(box: Box): boolean {
  return (
    box.container_status === ContainerStatus.STARTING ||
    box.container_status === ContainerStatus.RUNNING
  )
}

export function getStatusDotClass(box: Box): string {
  if (box.container_status === ContainerStatus.RUNNING) {
    if (
      box.activity === Activity.AGENT_WORKING ||
      box.activity === Activity.EXEC_SHELL
    ) {
      return "bg-state-writing"
    }
    return "bg-state-idle"
  }
  if (box.container_status === ContainerStatus.STARTING) {
    return "bg-state-starting"
  }
  if (box.box_outcome === BoxOutcome.COMPLETED) {
    return "bg-state-completed"
  }
  if (box.box_outcome === BoxOutcome.UNABLE_TO_PROCEED) {
    return "bg-state-error"
  }
  return "bg-state-idle"
}

export function getStatusText(box: Box): string {
  if (box.container_status === ContainerStatus.STARTING) return "Starting…"
  if (box.container_status === ContainerStatus.RUNNING) {
    if (box.activity === Activity.AGENT_WORKING) return "Working…"
    if (box.activity === Activity.EXEC_SHELL) return "Running command…"
    return "Idle"
  }
  if (box.box_outcome_message) return box.box_outcome_message
  if (box.box_outcome === BoxOutcome.COMPLETED) return "Completed"
  if (box.box_outcome === BoxOutcome.UNABLE_TO_PROCEED)
    return "Unable to proceed"
  if (box.error_detail) return "Error"
  return "Stopped"
}

export function getRelativeTime(box: Box): string {
  const ts = box.started_at ?? box.created_at
  if (!ts) return ""
  return formatDistanceToNow(new Date(ts), { addSuffix: true })
}
