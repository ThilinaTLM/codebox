import { useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FolderFavouriteIcon,
  GridViewIcon,
  Settings02Icon,
  Shield02Icon,
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
  to: "/projects/$projectSlug" | "/projects/$projectSlug/settings"
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
    key: "settings",
    label: "Project Settings",
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
  const onChooser = currentPath === "/projects"

  return (
    <aside
      className={cn(
        "group/sidebar flex h-full shrink-0 flex-col bg-sidebar transition-[width] duration-normal ease-out",
        collapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      <SidebarLogo collapsed={collapsed} onToggleCollapsed={setCollapsed} />

      <ProjectSwitcher activeSlug={activeSlug} collapsed={collapsed} />

      {!collapsed && (
        <div className="px-4 pb-1 pt-5">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Navigation
          </span>
        </div>
      )}

      <nav
        className={cn(
          "flex flex-col gap-0.5",
          collapsed ? "px-1.5 pt-3" : "px-2 pt-1"
        )}
      >
        {/* Project chooser */}
        <SidebarNavLink
          collapsed={collapsed}
          active={onChooser}
          icon={FolderFavouriteIcon}
          label="All projects"
          to="/projects"
        />

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
      </nav>

      {isPlatformAdmin && (
        <>
          {!collapsed && (
            <div className="mt-6 px-4 pb-1">
              <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">
                Platform
              </span>
            </div>
          )}
          <div
            className={cn(
              "flex flex-col gap-0.5",
              collapsed ? "px-1.5 pt-3" : "px-2 pt-1"
            )}
          >
            <SidebarNavLink
              collapsed={collapsed}
              active={false}
              icon={Shield02Icon}
              label="Platform admin"
              to="/platform/projects"
            />
          </div>
        </>
      )}

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

function SidebarNavLink({
  collapsed,
  active,
  icon,
  label,
  to,
}: {
  collapsed: boolean
  active: boolean
  icon: IconSvgElement
  label: string
  to: "/projects" | "/platform/projects"
}) {
  const button = (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link to={to} />}
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
        icon={icon}
        size={18}
        strokeWidth={2}
        className={cn(
          "shrink-0 transition-colors duration-fast",
          active && "text-primary"
        )}
      />
      {!collapsed && <span className="text-sm">{label}</span>}
    </Button>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return button
}
