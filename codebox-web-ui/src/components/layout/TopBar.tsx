import { Link, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { GridViewIcon, ContainerIcon, Settings02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function TopBar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      {/* Brand */}
      <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        Codebox
      </Link>

      {/* Nav icons */}
      <nav className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/" />}
          className={cn(
            "gap-1.5",
            currentPath === "/" && "bg-muted",
          )}
        >
          <HugeiconsIcon icon={GridViewIcon} size={16} strokeWidth={2} />
          <span className="hidden sm:inline">Boxes</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/containers" />}
          className={cn(
            "gap-1.5",
            currentPath === "/containers" && "bg-muted",
          )}
        >
          <HugeiconsIcon icon={ContainerIcon} size={16} strokeWidth={2} />
          <span className="hidden sm:inline">Containers</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/settings" />}
          className={cn(
            "gap-1.5",
            currentPath.startsWith("/settings") && "bg-muted",
          )}
        >
          <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={2} />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </nav>
    </header>
  )
}
