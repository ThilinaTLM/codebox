import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ContainerIcon,
  GridViewIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons"
import { Plus, StopCircle, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useBox, useCreateBox } from "@/net/query"
import { cn } from "@/lib/utils"
import { useBoxPageActions } from "@/components/box/BoxPageContext"
import { BoxStatusBadge } from "@/components/box/BoxStatusBadge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function TopBar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const navigate = useNavigate()
  const createMutation = useCreateBox()
  const boxPageActions = useBoxPageActions()

  // Extract boxId from path if on a box detail page
  const boxIdMatch = currentPath.match(/^\/boxes\/([^/]+)/)
  const boxId = boxIdMatch?.[1]
  const { data: box } = useBox(boxId)

  const isBoxPage = !!boxId && !!box

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

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between border-b px-4">
      {isBoxPage ? (
        /* Box page: integrated workspace header */
        <>
          {/* Left: logo + name */}
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              to="/"
              className="font-display flex items-center gap-2 text-base font-bold tracking-tight"
            >
              Codebox
            </Link>

            <div className="h-4 w-px bg-border/50" />

            <span className="font-display max-w-[180px] truncate text-sm font-medium">
              {box.container_name ?? box.name}
            </span>
          </div>

          {/* Center: status + model */}
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5">
            <BoxStatusBadge
              containerStatus={box.container_status}
              taskStatus={box.task_status}
              agentReportStatus={box.agent_report_status}
              activity={boxPageActions?.activity}
            />
            {box.model && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="hidden font-mono text-sm text-muted-foreground/60 sm:inline">
                  {box.model}
                </span>
              </>
            )}
          </div>

          {/* Right: stop + delete */}
          <div className="flex items-center gap-1">
            {boxPageActions?.isActive && (
              <AlertDialog>
                <Tooltip>
                  <AlertDialogTrigger
                    render={
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={boxPageActions.isStopPending}
                            className="text-muted-foreground hover:text-destructive"
                          />
                        }
                      />
                    }
                  >
                    <StopCircle size={16} />
                  </AlertDialogTrigger>
                  <TooltipContent>Stop agent</TooltipContent>
                </Tooltip>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Stop agent?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will stop the running agent.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={boxPageActions.onStop}
                    >
                      Stop
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <AlertDialog>
              <Tooltip>
                <AlertDialogTrigger
                  render={
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={boxPageActions?.isDeletePending}
                          className="text-muted-foreground hover:text-destructive"
                        />
                      }
                    />
                  }
                >
                  <Trash2 size={16} />
                </AlertDialogTrigger>
                <TooltipContent>Delete agent</TooltipContent>
              </Tooltip>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete agent?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the agent and all its data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={boxPageActions?.onDelete}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      ) : (
        <>
          {/* Default: Brand */}
          <Link
            to="/"
            className="font-display flex items-center gap-2 text-base font-bold tracking-tight"
          >
            Codebox
          </Link>

          {/* Default: Nav icons + New button */}
          <div className="flex items-center gap-1">
            <nav className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link to="/" />}
                className={cn("gap-1.5", currentPath === "/" && "bg-muted")}
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
                  currentPath.startsWith("/containers") && "bg-muted"
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
                  currentPath.startsWith("/settings") && "bg-muted"
                )}
              >
                <HugeiconsIcon
                  icon={Settings02Icon}
                  size={16}
                  strokeWidth={2}
                />
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
        </>
      )}
    </header>
  )
}
