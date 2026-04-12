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
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-inset px-3 text-xs">
      {/* Left: connection status */}
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 animate-pulse rounded-full bg-state-completed" />
        <span className="text-muted-foreground">Connected</span>
      </div>

      {/* Center: agent activity or count */}
      <div className="flex items-center gap-1.5">
        {isBoxPage && boxPageActions?.activity ? (
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
        ) : (
          <span className="text-muted-foreground">
            {activeCount > 0
              ? `${activeCount} active agent${activeCount !== 1 ? "s" : ""}`
              : "No active agents"}
          </span>
        )}
      </div>

      {/* Right: command palette hint + version */}
      <div className="flex items-center gap-2">
        <span className="text-2xs text-muted-foreground">⌘K</span>
        <span className="text-2xs text-ghost">v0.1.0</span>
      </div>
    </footer>
  )
}
