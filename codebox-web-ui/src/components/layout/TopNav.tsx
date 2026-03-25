import { useState } from "react"
import { Link, useRouterState } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "./ThemeToggle"
import { NewTaskDialog } from "@/components/task/NewTaskDialog"
import { cn } from "@/lib/utils"

const navLinks = [
  { label: "Dashboard", to: "/" },
  { label: "Tasks", to: "/tasks" },
  { label: "Sandboxes", to: "/sandboxes" },
  { label: "Containers", to: "/containers" },
] as const

export function TopNav() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-card/50 px-6 backdrop-blur-sm">
        <div className="flex items-center gap-6">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight">
              Codebox
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              orchestrator
            </span>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-1.5">
            {navLinks.map((link) => {
              const isActive =
                link.to === "/"
                  ? currentPath === "/"
                  : currentPath.startsWith(link.to)
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    "rounded-lg px-3.5 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">New Task</span>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <NewTaskDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
