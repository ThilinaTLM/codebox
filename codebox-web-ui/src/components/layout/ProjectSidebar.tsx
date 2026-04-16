import { useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Configuration02Icon,
  GridViewIcon,
  Settings02Icon,
  Shield02Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SidebarUserFooter } from "@/components/layout/SidebarUserFooter"
import {
  SidebarExpandButton,
  SidebarLogo,
} from "@/components/layout/SidebarLogo"
import { ProjectSwitcher } from "@/components/layout/ProjectSwitcher"
import { useActiveProjectSlug } from "@/hooks/useActiveProjectSlug"
import { useAuthStore } from "@/lib/auth"
import { cn } from "@/lib/utils"

interface ProjectNavItem {
  key: string
  label: string
  icon: IconSvgElement
  to:
    | "/projects/$projectSlug"
    | "/projects/$projectSlug/configs"
    | "/projects/$projectSlug/account"
    | "/projects/$projectSlug/settings"
  matchPrefix: (slug: string) => string
  exact?: boolean
}

const PROJECT_NAV: Array<ProjectNavItem> = [
  {
    key: "agents",
    label: "Agents",
    icon: GridViewIcon,
    to: "/projects/$projectSlug",
    matchPrefix: (slug) => `/projects/${slug}`,
    exact: true,
  },
  {
    key: "configs",
    label: "Configs",
    icon: Configuration02Icon,
    to: "/projects/$projectSlug/configs",
    matchPrefix: (slug) => `/projects/${slug}/configs`,
  },
  {
    key: "account",
    label: "Account",
    icon: UserCircleIcon,
    to: "/projects/$projectSlug/account",
    matchPrefix: (slug) => `/projects/${slug}/account`,
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings02Icon,
    to: "/projects/$projectSlug/settings",
    matchPrefix: (slug) => `/projects/${slug}/settings`,
  },
]

export function ProjectSidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const isBoxPage = currentPath.includes("/boxes/")
  const [collapsed, setCollapsed] = useState(isBoxPage)
  const user = useAuthStore((s) => s.user)
  const isPlatformAdmin = user?.user_type === "admin"

  const activeSlug = useActiveProjectSlug()

  return (
    <aside
      className={cn(
        "group/sidebar flex h-full shrink-0 flex-col bg-sidebar transition-[width] duration-normal ease-out",
        collapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      <SidebarLogo collapsed={collapsed} onToggleCollapsed={setCollapsed} />

      <ProjectSwitcher activeSlug={activeSlug} collapsed={collapsed} />

      <nav
        className={cn(
          "flex flex-col gap-0.5",
          collapsed ? "px-1.5 pt-3" : "px-2 pt-3"
        )}
      >
        {activeSlug &&
          PROJECT_NAV.map((item) => {
            const prefix = item.matchPrefix(activeSlug)
            const active = item.exact
              ? currentPath === prefix
              : currentPath.startsWith(prefix)

            const button = (
              <Button
                key={item.key}
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    to={item.to}
                    params={{ projectSlug: activeSlug }}
                  />
                }
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
                <Tooltip key={item.key}>
                  <TooltipTrigger render={button} />
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return button
          })}

        {isPlatformAdmin && (
          <PlatformShortcut collapsed={collapsed} />
        )}
      </nav>

      <div className="flex-1" />

      <SidebarUserFooter
        collapsed={collapsed}
        settingsTo="/projects/$projectSlug/settings"
        accountTo="/projects/$projectSlug/account"
        routeParams={activeSlug ? { projectSlug: activeSlug } : undefined}
      />

      {collapsed && (
        <div className="px-2 pb-2">
          <SidebarExpandButton onExpand={() => setCollapsed(false)} />
        </div>
      )}
    </aside>
  )
}

function PlatformShortcut({ collapsed }: { collapsed: boolean }) {
  const button = (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link to="/platform/projects" />}
      className={cn(
        "group/navitem relative justify-start gap-2.5 rounded-lg text-muted-foreground transition-all duration-fast hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      <HugeiconsIcon
        icon={Shield02Icon}
        size={18}
        strokeWidth={2}
        className="shrink-0 transition-colors duration-fast"
      />
      {!collapsed && <span className="text-sm">Platform</span>}
    </Button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent side="right" sideOffset={8}>
          Platform
        </TooltipContent>
      </Tooltip>
    )
  }

  return button
}
