import { useRouterState } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import { useBoxPageActions } from "@/components/box/BoxPageContext"
import { useBoxes } from "@/net/query"
import { ContainerStatus } from "@/net/http/types"
import { STATE_DOT_COLORS } from "@/lib/state-colors"
import { useActiveProjectSlug } from "@/hooks/useActiveProjectSlug"
import { useConnectionStore } from "@/lib/connection"

interface ConnectionIndicatorState {
  dotClass: string
  pulse: boolean
  label: string
}

/**
 * Resolve the status-bar connection indicator.
 *
 * Priority (worst first):
 *   1. Not authenticated / global SSE down  -> "Disconnected" (red)
 *   2. On a box page with gRPC down         -> "Sandbox disconnected" (red)
 *   3. On a box page with chat SSE down     -> "Chat stream reconnecting…" (warning)
 *   4. All good                             -> "Connected" (green)
 */
function resolveIndicator(
  globalConnected: boolean,
  boxActions: ReturnType<typeof useBoxPageActions>
): ConnectionIndicatorState {
  if (!globalConnected) {
    return {
      dotClass: "bg-state-error",
      pulse: true,
      label: "Disconnected",
    }
  }

  if (boxActions && boxActions.isActive) {
    if (!boxActions.grpcConnected) {
      return {
        dotClass: "bg-state-error",
        pulse: true,
        label: "Sandbox disconnected",
      }
    }
    if (!boxActions.chatConnected) {
      return {
        dotClass: "bg-warning",
        pulse: true,
        label: "Chat stream reconnecting…",
      }
    }
  }

  return {
    dotClass: "bg-state-completed",
    pulse: true,
    label: "Connected",
  }
}

export function StatusBar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const isBoxPage = currentPath.includes("/boxes/")

  const boxPageActions = useBoxPageActions()
  const activeSlug = useActiveProjectSlug()
  const { data: boxes } = useBoxes(activeSlug ?? undefined)
  const globalConnected = useConnectionStore((s) => s.globalStreamConnected)

  const activeCount = (boxes ?? []).filter(
    (b) =>
      b.container_status === ContainerStatus.RUNNING ||
      b.container_status === ContainerStatus.STARTING
  ).length

  const indicator = resolveIndicator(globalConnected, boxPageActions)

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-inset px-3 text-xs">
      {/* Left: connection status */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 rounded-full",
            indicator.dotClass,
            indicator.pulse && "animate-pulse"
          )}
        />
        <span className="text-muted-foreground">{indicator.label}</span>
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
            {activeSlug
              ? activeCount > 0
                ? `${activeCount} active agent${activeCount !== 1 ? "s" : ""}`
                : "No active agents"
              : ""}
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
