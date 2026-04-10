import { useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { GridViewIcon, Settings02Icon } from "@hugeicons/core-free-icons"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function AppSidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const isBoxPage = currentPath.startsWith("/boxes/")
  const [collapsed, setCollapsed] = useState(isBoxPage)

  const navItems = [
    {
      icon: GridViewIcon,
      label: "Agents",
      to: "/" as const,
      active: currentPath === "/",
    },
    {
      icon: Settings02Icon,
      label: "Settings",
      to: "/settings" as const,
      active: currentPath.startsWith("/settings"),
    },
  ]

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-14" : "w-[220px]"
      )}
    >
      {/* Top: Logo */}
      <div
        className={cn(
          "flex h-12 shrink-0 items-center border-b border-sidebar-border px-3",
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
            <span className="truncate font-display text-sm font-semibold text-sidebar-foreground">
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
              "justify-start gap-2",
              item.active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
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

      {/* Bottom: New Agent + Collapse toggle */}
      <div className="flex flex-col gap-1 border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size={collapsed ? "icon-sm" : "sm"}
          className={cn(
            "text-muted-foreground hover:text-sidebar-foreground",
            !collapsed && "w-full justify-start gap-2"
          )}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <>
              <PanelLeftClose size={16} />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}
