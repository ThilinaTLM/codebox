import { isToday } from "date-fns"
import type { Box } from "@/net/http/types"
import { Activity, ContainerStatus, TaskOutcome } from "@/net/http/types"
import { cn } from "@/lib/utils"

interface DashboardStatsProps {
  boxes: Array<Box>
}

function isBoxActive(box: Box): boolean {
  return (
    box.container_status === ContainerStatus.STARTING ||
    box.container_status === ContainerStatus.RUNNING
  )
}

function getAgentDotColor(box: Box): string {
  if (box.container_status === ContainerStatus.STARTING) {
    return "bg-state-starting"
  }
  if (box.container_status === ContainerStatus.RUNNING) {
    if (
      box.activity === Activity.AGENT_WORKING ||
      box.activity === Activity.EXEC_SHELL
    ) {
      return "bg-state-writing"
    }
    return "bg-state-idle"
  }
  return "bg-state-idle"
}

export function DashboardStats({ boxes }: DashboardStatsProps) {
  const activeBoxes = boxes.filter(isBoxActive)
  const activeCount = activeBoxes.length

  const todayCount = boxes.filter(
    (b) => b.created_at && isToday(new Date(b.created_at))
  ).length

  const stoppedToday = boxes.filter(
    (b) =>
      b.container_status === ContainerStatus.STOPPED &&
      b.created_at &&
      isToday(new Date(b.created_at))
  )
  const completedToday = stoppedToday.filter(
    (b) => b.task_outcome === TaskOutcome.COMPLETED
  ).length
  const successRate =
    stoppedToday.length > 0
      ? Math.round((completedToday / stoppedToday.length) * 100)
      : 0

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Active */}
      <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="font-display text-2xl font-semibold">{activeCount}</div>
        <div className="text-label mt-1">Active</div>
        {activeBoxes.length > 0 && (
          <div className="mt-2 flex items-center gap-1">
            {activeBoxes.slice(0, 10).map((box) => (
              <span
                key={box.id}
                className={cn("size-1.5 rounded-full", getAgentDotColor(box))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Today */}
      <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="font-display text-2xl font-semibold">{todayCount}</div>
        <div className="text-label mt-1">Today</div>
      </div>

      {/* Success Rate */}
      <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="font-display text-2xl font-semibold">{successRate}%</div>
        <div className="text-label mt-1">Success Rate</div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${successRate}%` }}
          />
        </div>
      </div>
    </div>
  )
}
