import { useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  GridViewIcon,
  Settings02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { useAuthStore } from "@/lib/auth"
import { cn } from "@/lib/utils"

export function AppSidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const isBoxPage = currentPath.startsWith("/boxes/")
  const [collapsed, setCollapsed] = useState(isBoxPage)

  const user = useAuthStore((s) => s.user)

  const navItems = [
    {
      icon: GridViewIcon,
      label: "Agents",
      to: "/" as const,
      active: currentPath === "/",
    },
    ...(user?.user_type === "admin"
      ? [
          {
            icon: UserGroupIcon,
            label: "Users",
            to: "/users" as const,
            active: currentPath.startsWith("/users"),
          },
        ]
      : []),
    {
      icon: Settings02Icon,
      label: "Settings",
      to: "/settings" as const,
      active: currentPath.startsWith("/settings"),
    },
  ]

  const userInitial = user?.username
    ? user.username.charAt(0).toUpperCase()
    : "?"

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-normal",
        collapsed ? "w-14" : "w-[220px]"
      )}
    >
      {/* Top: Logo */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-sidebar-border px-3",
          collapsed && "justify-center"
        )}
      >
        <Link to="/" className="flex items-center gap-2 overflow-hidden">
          <img
            src="/codebox-logo.svg"
            alt="Codebox"
            className="size-5 shrink-0"
          />
          {!collapsed && (
            <span className="truncate font-display text-sm text-sidebar-foreground">
              Codebox
            </span>
          )}
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 px-2 pt-3">
        {navItems.map((item) => (
          <Button
            key={item.to}
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to={item.to} />}
            className={cn(
              "justify-start gap-2 rounded-none",
              item.active
                ? "border-l-[3px] border-primary bg-primary/5 text-foreground"
                : "border-l-[3px] border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30",
              collapsed && "justify-center px-0"
            )}
          >
            <HugeiconsIcon
              icon={item.icon}
              size={18}
              strokeWidth={2}
              className="shrink-0"
            />
            {!collapsed && <span>{item.label}</span>}
          </Button>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: User section + collapse toggle */}
      <div className="flex flex-col gap-2 border-t border-sidebar-border p-2">
        {/* User info row */}
        <div
          className={cn(
            "flex items-center gap-2",
            collapsed && "justify-center"
          )}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {userInitial}
          </div>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground">
                {user?.username}
              </span>
              <ThemeToggle />
            </>
          )}
        </div>

        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size={collapsed ? "icon-sm" : "icon-sm"}
          className={cn(
            "text-muted-foreground hover:text-sidebar-foreground",
            !collapsed && "self-end"
          )}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </Button>
      </div>
    </aside>
  )
}
