import { HugeiconsIcon } from "@hugeicons/react"
import { Moon02Icon } from "@hugeicons/core-free-icons"

export function ThemeToggle() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-36 items-center rounded-lg border-2 border-primary bg-primary/5 p-3">
        <div className="rounded-md bg-inset p-2">
          <div className="flex gap-1">
            <div className="size-1.5 rounded-full bg-border" />
            <div className="size-1.5 rounded-full bg-border" />
            <div className="size-1.5 rounded-full bg-border" />
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-1.5 w-3/4 rounded-full bg-border" />
            <div className="h-1.5 w-1/2 rounded-full bg-muted" />
            <div className="h-1.5 w-2/3 rounded-full bg-muted" />
          </div>
        </div>
        <div className="ml-3 flex items-center gap-2">
          <HugeiconsIcon
            icon={Moon02Icon}
            size={14}
            strokeWidth={2}
            className="text-primary"
          />
          <span className="text-sm font-medium text-primary">Dark</span>
        </div>
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">
        The command-center aesthetic uses a dark-only theme for optimal readability and atmosphere.
      </p>
    </div>
  )
}
