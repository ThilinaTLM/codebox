import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Logout03Icon, Settings02Icon } from "@hugeicons/core-free-icons"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { useAuthStore } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface SidebarUserFooterProps {
  collapsed: boolean
}

export function SidebarUserFooter({ collapsed }: SidebarUserFooterProps) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [signOutOpen, setSignOutOpen] = useState(false)

  const displayName = (() => {
    const parts = [user?.first_name, user?.last_name].filter(Boolean)
    return parts.length > 0 ? parts.join(" ") : (user?.username ?? "")
  })()

  const userInitial = (() => {
    if (user?.first_name) return user.first_name.charAt(0).toUpperCase()
    return user?.username ? user.username.charAt(0).toUpperCase() : "?"
  })()

  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-2",
        !collapsed && "border-t border-sidebar-border"
      )}
    >
      {!collapsed && (
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">
            Theme
          </span>
          <ThemeToggle />
        </div>
      )}

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
                "flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left transition-colors duration-fast hover:bg-sidebar-accent/50"
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
                <HugeiconsIcon
                  icon={Settings02Icon}
                  size={16}
                  strokeWidth={2}
                />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setSignOutOpen(true)}
              >
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
    </div>
  )
}
