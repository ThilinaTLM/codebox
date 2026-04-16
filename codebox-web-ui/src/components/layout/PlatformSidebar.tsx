import { useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FolderFavouriteIcon,
  FolderLibraryIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SidebarUserFooter } from "@/components/layout/SidebarUserFooter"
import {
  SidebarExpandButton,
  SidebarLogo,
} from "@/components/layout/SidebarLogo"
import { cn } from "@/lib/utils"

interface PlatformNavItem {
  to: string
  label: string
  icon: IconSvgElement
  matchPrefix: string
}

const PLATFORM_NAV: Array<PlatformNavItem> = [
  {
    to: "/platform/projects",
    label: "Projects",
    icon: FolderLibraryIcon,
    matchPrefix: "/platform/projects",
  },
  {
    to: "/platform/users",
    label: "Users",
    icon: UserGroupIcon,
    matchPrefix: "/platform/users",
  },
]

export function PlatformSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <aside
      className={cn(
        "group/sidebar flex h-full shrink-0 flex-col bg-sidebar transition-[width] duration-normal ease-out",
        collapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      <SidebarLogo collapsed={collapsed} onToggleCollapsed={setCollapsed} />

      {!collapsed && (
        <div className="px-4 pb-1 pt-4">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Platform
          </span>
        </div>
      )}

      <nav
        className={cn(
          "flex flex-col gap-0.5",
          collapsed ? "px-1.5 pt-3" : "px-2 pt-1"
        )}
      >
        {PLATFORM_NAV.map((item) => {
          const active = currentPath.startsWith(item.matchPrefix)
          const button = (
            <Button
              key={item.to}
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link to={item.to} />}
              className={cn(
                "group/navitem relative justify-start gap-2.5 rounded-lg transition-all duration-fast",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-normal" />
              )}
              <HugeiconsIcon
                icon={item.icon}
                size={18}
                strokeWidth={2}
                className={cn(
                  "shrink-0 transition-colors duration-fast",
                  active && "text-primary"
                )}
              />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </Button>
          )

          if (collapsed) {
            return (
              <Tooltip key={item.to}>
                <TooltipTrigger render={button} />
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          }

          return button
        })}
      </nav>

      {/* Open a project quickly from the platform shell */}
      {!collapsed && (
        <div className="mt-6 px-4 pb-1">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Shortcuts
          </span>
        </div>
      )}
      <div
        className={cn(
          "flex flex-col gap-0.5",
          collapsed ? "px-1.5 pt-3" : "px-2 pt-1"
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/projects" />}
          className={cn(
            "justify-start gap-2.5 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          <HugeiconsIcon
            icon={FolderFavouriteIcon}
            size={18}
            strokeWidth={2}
            className="shrink-0"
          />
          {!collapsed && <span className="text-sm">Open project</span>}
        </Button>
      </div>

      <div className="flex-1" />

      <SidebarUserFooter collapsed={collapsed} />

      {collapsed && (
        <div className="px-2 pb-2">
          <SidebarExpandButton onExpand={() => setCollapsed(false)} />
        </div>
      )}
    </aside>
  )
}
