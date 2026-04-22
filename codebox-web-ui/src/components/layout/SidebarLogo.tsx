import { Link } from "@tanstack/react-router"
import { ChevronsLeft, ChevronsRight } from "lucide-react"
import { CodeboxLogo } from "@/components/layout/CodeboxLogo"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface SidebarLogoProps {
  collapsed: boolean
  onToggleCollapsed: (next: boolean) => void
  /**
   * Target for the logo link. Each layout passes the destination appropriate
   * for its context (e.g. Platform layout links to Projects; Project layout
   * links to the active project's Agents page).
   */
  to: string
  params?: Record<string, string>
}

export function SidebarLogo({
  collapsed,
  onToggleCollapsed,
  to,
  params,
}: SidebarLogoProps) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center px-3",
        collapsed ? "justify-center" : "justify-between"
      )}
    >
      <Link
        // Cast keeps this component layout-agnostic — callers own the route typing.
        to={to as never}
        params={params as never}
        className="flex items-center gap-2.5 overflow-hidden"
      >
        <CodeboxLogo className="size-5 text-sidebar-foreground" />
        {!collapsed && (
          <span className="truncate font-display text-sm tracking-tight text-sidebar-foreground">
            Codebox
          </span>
        )}
      </Link>
      {!collapsed && (
        <button
          onClick={() => onToggleCollapsed(true)}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all duration-fast hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover/sidebar:opacity-100"
          aria-label="Collapse sidebar"
        >
          <ChevronsLeft size={14} />
        </button>
      )}
    </div>
  )
}

export function SidebarExpandButton({ onExpand }: { onExpand: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        className="mx-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-sidebar-accent hover:text-sidebar-foreground"
        onClick={onExpand}
        aria-label="Expand sidebar"
      >
        <ChevronsRight size={14} />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        Expand sidebar
      </TooltipContent>
    </Tooltip>
  )
}
