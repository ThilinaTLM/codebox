import { useTheme } from "next-themes"
import { Monitor } from "lucide-react"
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import { cn } from "@/lib/utils"

const THEME_OPTIONS = [
  { id: "light", label: "Light", icon: Sun03Icon, isHugeicon: true },
  { id: "dark", label: "Dark", icon: Moon02Icon, isHugeicon: true },
  { id: "system", label: "System", icon: Monitor, isHugeicon: false },
] as const

export function AppearanceSection() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg">Theme</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Choose how Codebox looks to you. Select a single theme or sync with
          your system settings.
        </p>
        <div className="mt-4 grid max-w-md grid-cols-3 gap-3">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                theme === t.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-foreground/20"
              )}
            >
              {t.isHugeicon ? (
                <HugeiconsIcon
                  icon={t.icon as IconSvgElement}
                  size={24}
                  strokeWidth={1.5}
                />
              ) : (
                <Monitor size={24} strokeWidth={1.5} />
              )}
              <span className="text-sm font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
