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
          "flex w-36 items-center rounded-lg border-2 p-3 transition-colors",
          theme === "light"
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-muted-foreground/30"
        )}
      >
        {/* Light preview – always renders light colors */}
        <div className="rounded-md bg-white p-2">
          <div className="flex gap-1">
            <div className="size-1.5 rounded-full bg-gray-300" />
            <div className="size-1.5 rounded-full bg-gray-300" />
            <div className="size-1.5 rounded-full bg-gray-300" />
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-1.5 w-3/4 rounded-full bg-gray-300" />
            <div className="h-1.5 w-1/2 rounded-full bg-gray-200" />
            <div className="h-1.5 w-2/3 rounded-full bg-gray-200" />
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
          "flex w-36 items-center rounded-lg border-2 p-3 transition-colors",
          theme === "dark"
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-muted-foreground/30"
        )}
      >
        {/* Dark preview – always renders dark colors */}
        <div className="rounded-md bg-zinc-900 p-2">
          <div className="flex gap-1">
            <div className="size-1.5 rounded-full bg-zinc-600" />
            <div className="size-1.5 rounded-full bg-zinc-600" />
            <div className="size-1.5 rounded-full bg-zinc-600" />
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-1.5 w-3/4 rounded-full bg-zinc-600" />
            <div className="h-1.5 w-1/2 rounded-full bg-zinc-700" />
            <div className="h-1.5 w-2/3 rounded-full bg-zinc-700" />
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
