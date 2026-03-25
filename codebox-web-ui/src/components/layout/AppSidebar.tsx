import { Link, useRouterState, useNavigate } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "./ThemeToggle"
import { useSandboxes, useCreateSandbox, useDeleteSandbox } from "@/net/query"
import { SandboxStatus } from "@/net/http/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const statusDot: Record<string, string> = {
  [SandboxStatus.READY]: "bg-success",
  [SandboxStatus.STARTING]: "bg-warning",
  [SandboxStatus.STOPPED]: "bg-muted-foreground/40",
  [SandboxStatus.FAILED]: "bg-destructive",
}

export function AppSidebar() {
  const { data: sandboxes, isLoading } = useSandboxes()
  const createMutation = useCreateSandbox()
  const deleteMutation = useDeleteSandbox()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const handleCreate = () => {
    createMutation.mutate(
      {},
      {
        onSuccess: (sandbox) => {
          toast.success("Sandbox created")
          navigate({ to: "/sandboxes/$sandboxId", params: { sandboxId: sandbox.id } })
        },
        onError: () => toast.error("Failed to create sandbox"),
      },
    )
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success("Sandbox deleted"),
    })
  }

  return (
    <Sidebar side="left" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/" />} tooltip="Codebox">
              <span className="text-sm font-semibold tracking-tight">C</span>
              <span className="text-sm font-semibold tracking-tight">Codebox</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="New Sandbox"
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2.5} />
              <span>New Sandbox</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sandboxes</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading ? (
                <>
                  <SidebarMenuSkeleton showIcon index={0} />
                  <SidebarMenuSkeleton showIcon index={1} />
                  <SidebarMenuSkeleton showIcon index={2} />
                </>
              ) : (
                sandboxes?.map((sandbox) => {
                  const isActive = currentPath === `/sandboxes/${sandbox.id}`
                  return (
                    <SidebarMenuItem key={sandbox.id}>
                      <SidebarMenuButton
                        render={
                          <Link
                            to="/sandboxes/$sandboxId"
                            params={{ sandboxId: sandbox.id }}
                          />
                        }
                        isActive={isActive}
                        tooltip={sandbox.name}
                      >
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            statusDot[sandbox.status] ?? "bg-muted-foreground/40",
                          )}
                        />
                        <span>{sandbox.name}</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        showOnHover
                        onClick={(e) => handleDelete(sandbox.id, e)}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={12} />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  )
                })
              )}
              {!isLoading && (!sandboxes || sandboxes.length === 0) && (
                <p className="px-3 py-2 text-xs text-sidebar-foreground/50">
                  No sandboxes yet
                </p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>More</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/" />} isActive={currentPath === "/"} tooltip="Home">
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/tasks" />} isActive={currentPath.startsWith("/tasks")} tooltip="Tasks">
                  <span>Tasks</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/containers" />} isActive={currentPath === "/containers"} tooltip="Containers">
                  <span>Containers</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/settings/github" />} isActive={currentPath.startsWith("/settings")} tooltip="Settings">
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between px-1">
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
