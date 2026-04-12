import { useRouterState } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import { useBoxPageActions } from "@/components/box/BoxPageContext"
import { useBoxes } from "@/net/query"
import { ContainerStatus } from "@/net/http/types"
import { STATE_DOT_COLORS } from "@/lib/state-colors"

export function StatusBar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const isBoxPage = currentPath.startsWith("/boxes/")

  const boxPageActions = useBoxPageActions()
  const { data: boxes } = useBoxes()

  const activeCount = (boxes ?? []).filter(
    (b) =>
      b.container_status === ContainerStatus.RUNNING ||
      b.container_status === ContainerStatus.STARTING
  ).length

  return (
    <footer className="font-terminal flex h-6 shrink-0 items-center justify-between border-t border-border bg-inset px-3 text-xs">
      {/* Left: connection status */}
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-state-completed" />
        <span className="text-muted-foreground">Connected</span>
      </div>

      {/* Center: agent activity (box pages only) */}
      <div className="flex items-center gap-1.5">
        {isBoxPage && boxPageActions?.activity && (
          <>
            <span
              className={cn(
                "size-1.5 rounded-full",
                STATE_DOT_COLORS[boxPageActions.activity.state]
              )}
            />
            <span className="text-muted-foreground">
              {boxPageActions.activity.label}
            </span>
          </>
        )}
      </div>

      {/* Right: active agent count */}
      <div className="text-2xs text-muted-foreground">
        {activeCount > 0 && (
          <span>
            {activeCount} active agent{activeCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </footer>
  )
}
