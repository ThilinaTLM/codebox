import { Link } from "@tanstack/react-router"
import { ChevronsLeft, ChevronsRight } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface SidebarLogoProps {
  collapsed: boolean
  onToggleCollapsed: (next: boolean) => void
}

export function SidebarLogo({ collapsed, onToggleCollapsed }: SidebarLogoProps) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center px-3",
        collapsed ? "justify-center" : "justify-between"
      )}
    >
      <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
        <img
          src="/codebox-logo.svg"
          alt="Codebox"
          className="size-5 shrink-0"
        />
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
