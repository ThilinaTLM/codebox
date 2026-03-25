import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { GridViewIcon, ContainerIcon, Settings02Icon } from "@hugeicons/core-free-icons"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCreateBox } from "@/net/query"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function TopBar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const navigate = useNavigate()
  const createMutation = useCreateBox()

  const handleCreate = () => {
    createMutation.mutate(
      {},
      {
        onSuccess: (box) => {
          toast.success("Agent created")
          navigate({ to: "/boxes/$boxId", params: { boxId: box.id } })
        },
        onError: () => toast.error("Failed to create agent"),
      },
    )
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
      {/* Brand */}
      <Link to="/" className="font-display flex items-center gap-2 text-base font-bold tracking-tight">
        Codebox
      </Link>

      {/* Nav icons + New button */}
      <div className="flex items-center gap-1">
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
            <span className="hidden sm:inline">Agents</span>
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
        <div className="ml-1 h-4 w-px bg-border" />
        <Button
          variant="default"
          size="sm"
          className="ml-1 gap-1.5"
          onClick={handleCreate}
          disabled={createMutation.isPending}
        >
          <Plus size={14} />
          <span className="hidden sm:inline">New</span>
        </Button>
      </div>
    </header>
  )
}
