import { isToday } from "date-fns"
import type { Box } from "@/net/http/types"
import { BoxOutcome, ContainerStatus } from "@/net/http/types"
import { cn } from "@/lib/utils"
import { getStatusDotClass, isBoxActive } from "@/lib/box-utils"

interface DashboardStatsProps {
  boxes: Array<Box>
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
    (b) => b.box_outcome === BoxOutcome.COMPLETED
  ).length
  const successRate =
    stoppedToday.length > 0
      ? Math.round((completedToday / stoppedToday.length) * 100)
      : 0

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="font-display text-2xl font-semibold">{activeCount}</div>
        <div className="text-label mt-1">Active</div>
        {activeBoxes.length > 0 && (
          <div className="mt-2 flex items-center gap-1">
            {activeBoxes.slice(0, 10).map((box) => (
              <span
                key={box.id}
                className={cn("size-1.5 rounded-full", getStatusDotClass(box))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="font-display text-2xl font-semibold">{todayCount}</div>
        <div className="text-label mt-1">Today</div>
      </div>

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
