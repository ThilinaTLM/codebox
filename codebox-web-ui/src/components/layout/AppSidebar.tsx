import { useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  GridViewIcon,
  Logout03Icon,
  Settings02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { useAuthStore } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"

export function AppSidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const isBoxPage = currentPath.startsWith("/boxes/")
  const [collapsed, setCollapsed] = useState(isBoxPage)
  const [signOutOpen, setSignOutOpen] = useState(false)

  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

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

  const displayName = (() => {
    const parts = [user?.first_name, user?.last_name].filter(Boolean)
    return parts.length > 0 ? parts.join(" ") : user?.username ?? ""
  })()

  const userInitial = (() => {
    if (user?.first_name) return user.first_name.charAt(0).toUpperCase()
    return user?.username ? user.username.charAt(0).toUpperCase() : "?"
  })()

  return (
    <aside
      className={cn(
        "group/sidebar flex h-full shrink-0 flex-col bg-sidebar transition-[width] duration-normal ease-out",
        collapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      {/* Top: Logo + collapse toggle */}
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
            onClick={() => setCollapsed(true)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all duration-fast hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover/sidebar:opacity-100"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft size={14} />
          </button>
        )}
      </div>

      {/* Section label */}
      {!collapsed && (
        <div className="px-4 pb-1 pt-4">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Navigation
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav className={cn("flex flex-col gap-0.5", collapsed ? "px-1.5 pt-3" : "px-2 pt-1")}>
        {navItems.map((item) => {
          const button = (
            <Button
              key={item.to}
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link to={item.to} />}
              className={cn(
                "group/navitem relative justify-start gap-2.5 rounded-lg transition-all duration-fast",
                item.active
                  ? "bg-sidebar-accent text-sidebar-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              {/* Active indicator dot */}
              {item.active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-normal" />
              )}
              <HugeiconsIcon
                icon={item.icon}
                size={18}
                strokeWidth={2}
                className={cn(
                  "shrink-0 transition-colors duration-fast",
                  item.active && "text-primary"
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: User section */}
      <div className={cn("flex flex-col gap-1 p-2", !collapsed && "border-t border-sidebar-border")}>
        {/* Theme toggle row (expanded only) */}
        {!collapsed && (
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">Theme</span>
            <ThemeToggle />
          </div>
        )}

        {/* User card */}
        {collapsed ? (
          <div className="flex items-center justify-center rounded-lg p-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-medium text-primary transition-colors duration-fast">
              {userInitial}
            </div>
          </div>
        ) : (
          <>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left transition-colors duration-fast hover:bg-sidebar-accent/50",
              )}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-medium text-primary transition-colors duration-fast">
                {userInitial}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {displayName}
                </span>
                <span className="truncate text-2xs text-muted-foreground">
                  {user?.user_type === "admin" ? "Administrator" : "User"}
                </span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-48">
              <DropdownMenuItem render={<Link to="/settings/account" />}>
                <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={2} />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setSignOutOpen(true)}>
                <HugeiconsIcon icon={Logout03Icon} size={16} strokeWidth={2} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ConfirmActionDialog
            open={signOutOpen}
            onOpenChange={setSignOutOpen}
            title="Sign out"
            description="Are you sure you want to sign out?"
            confirmLabel="Sign out"
            confirmVariant="destructive"
            onConfirm={logout}
          />
          </>
        )}

        {/* Expand toggle (collapsed only) */}
        {collapsed && (
          <Tooltip>
            <TooltipTrigger
              className="mx-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <ChevronsRight size={14} />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Expand sidebar
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </aside>
  )
}
