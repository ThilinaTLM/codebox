import { useState } from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { GridViewIcon, Settings02Icon } from "@hugeicons/core-free-icons"
import { Plus, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useBoxes, useCreateBox } from "@/net/query"
import { ContainerStatus } from "@/net/http/types"

export function AppSidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const navigate = useNavigate()
  const createMutation = useCreateBox()

  const isBoxPage = currentPath.startsWith("/boxes/")
  const [collapsed, setCollapsed] = useState(isBoxPage)

  const { data: boxes } = useBoxes()
  const activeBoxes = (boxes ?? []).filter(
    (b) =>
      b.container_status === ContainerStatus.RUNNING ||
      b.container_status === ContainerStatus.STARTING
  )

  const handleCreate = () => {
    createMutation.mutate(
      {},
      {
        onSuccess: (newBox) => {
          toast.success("Agent created")
          navigate({ to: "/boxes/$boxId", params: { boxId: newBox.id } })
        },
        onError: () => toast.error("Failed to create agent"),
      }
    )
  }

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
      <div className="flex h-12 shrink-0 items-center border-b border-sidebar-border px-3">
        <Link
          to="/"
          className="flex items-center gap-2 overflow-hidden"
        >
          <span className="font-display shrink-0 text-base font-bold text-primary">
            CB
          </span>
          {!collapsed && (
            <span className="font-display truncate text-sm font-semibold text-sidebar-foreground">
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

      {/* Middle: Active boxes (expanded only) */}
      {!collapsed && activeBoxes.length > 0 && (
        <div className="mt-4 flex flex-col gap-1 px-2">
          <span className="px-2 text-xs uppercase tracking-widest text-ghost">
            Active
          </span>
          <div className="mt-1 flex flex-col gap-0.5">
            {activeBoxes.map((box) => (
              <Link
                key={box.id}
                to="/boxes/$boxId"
                params={{ boxId: box.id }}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                  currentPath === `/boxes/${box.id}`
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    box.container_status === ContainerStatus.RUNNING
                      ? "bg-state-completed"
                      : "bg-state-starting"
                  )}
                />
                <span className="truncate">
                  {box.container_name ?? box.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: New Agent + Collapse toggle */}
      <div className="flex flex-col gap-1 border-t border-sidebar-border p-2">
        <Button
          size={collapsed ? "icon-sm" : "sm"}
          className={cn("gap-1.5", !collapsed && "w-full")}
          onClick={handleCreate}
          disabled={createMutation.isPending}
        >
          <Plus size={16} />
          {!collapsed && <span>New Agent</span>}
        </Button>

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
