import { useTheme } from "next-themes"
import { HugeiconsIcon } from "@hugeicons/react"
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => setTheme("light")}
        className={cn(
          "flex w-36 items-center rounded-lg border-2 p-3 transition-colors duration-normal",
          theme === "light"
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-muted-foreground/30"
        )}
      >
        {/* Light preview – always renders light colors (inline styles for static preview) */}
        <div className="rounded-md border p-2" style={{ background: 'oklch(0.98 0.002 265)' }}>
          <div className="flex gap-1">
            <div className="size-1.5 rounded-full" style={{ background: 'oklch(0.89 0.004 265)' }} />
            <div className="size-1.5 rounded-full" style={{ background: 'oklch(0.89 0.004 265)' }} />
            <div className="size-1.5 rounded-full" style={{ background: 'oklch(0.89 0.004 265)' }} />
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-1.5 w-3/4 rounded-full" style={{ background: 'oklch(0.89 0.004 265)' }} />
            <div className="h-1.5 w-1/2 rounded-full" style={{ background: 'oklch(0.945 0.003 265)' }} />
            <div className="h-1.5 w-2/3 rounded-full" style={{ background: 'oklch(0.945 0.003 265)' }} />
          </div>
        </div>
        <div className="ml-3 flex items-center gap-2">
          <HugeiconsIcon
            icon={Sun03Icon}
            size={14}
            strokeWidth={2}
            className={
              theme === "light" ? "text-primary" : "text-muted-foreground"
            }
          />
          <span
            className={cn(
              "text-sm font-medium",
              theme === "light" ? "text-primary" : "text-muted-foreground"
            )}
          >
            Light
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        className={cn(
          "flex w-36 items-center rounded-lg border-2 p-3 transition-colors duration-normal",
          theme === "dark"
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-muted-foreground/30"
        )}
      >
        {/* Dark preview – always renders dark colors (inline styles for static preview) */}
        <div className="rounded-md border p-2" style={{ background: 'oklch(0.13 0.008 265)' }}>
          <div className="flex gap-1">
            <div className="size-1.5 rounded-full" style={{ background: 'oklch(0.25 0.01 265)' }} />
            <div className="size-1.5 rounded-full" style={{ background: 'oklch(0.25 0.01 265)' }} />
            <div className="size-1.5 rounded-full" style={{ background: 'oklch(0.25 0.01 265)' }} />
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-1.5 w-3/4 rounded-full" style={{ background: 'oklch(0.25 0.01 265)' }} />
            <div className="h-1.5 w-1/2 rounded-full" style={{ background: 'oklch(0.19 0.008 265)' }} />
            <div className="h-1.5 w-2/3 rounded-full" style={{ background: 'oklch(0.19 0.008 265)' }} />
          </div>
        </div>
        <div className="ml-3 flex items-center gap-2">
          <HugeiconsIcon
            icon={Moon02Icon}
            size={14}
            strokeWidth={2}
            className={
              theme === "dark" ? "text-primary" : "text-muted-foreground"
            }
          />
          <span
            className={cn(
              "text-sm font-medium",
              theme === "dark" ? "text-primary" : "text-muted-foreground"
            )}
          >
            Dark
          </span>
        </div>
      </button>
    </div>
  )
}
