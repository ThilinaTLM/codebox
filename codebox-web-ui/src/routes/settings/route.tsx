import { Link, Outlet, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  ArrowLeft02Icon,
  PaintBoardIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-mobile"

const SECTIONS: Array<{
  to: string
  label: string
  icon: IconSvgElement
}> = [
  { to: "/settings/account", label: "Account", icon: UserCircleIcon },
  { to: "/settings/appearance", label: "Appearance", icon: PaintBoardIcon },
]

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
})

function SettingsLayout() {
  const isMobile = useIsMobile()
  const router = useRouter()

  const handleBack = () => {
    if (
      typeof window !== "undefined" &&
      window.history.length > 1 &&
      document.referrer !== ""
    ) {
      router.history.back()
    } else {
      void router.navigate({ to: "/" })
    }
  }

  if (isMobile) {
    return (
      <div className="flex h-svh flex-col bg-background">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <HugeiconsIcon
              icon={ArrowLeft02Icon}
              size={16}
              strokeWidth={2}
            />
            Back
          </Button>
          <h1 className="font-display text-base font-semibold">Settings</h1>
        </div>
        <div className="shrink-0 border-b border-border">
          <div className="flex gap-1 overflow-x-auto px-4 py-2">
            {SECTIONS.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                activeOptions={{ exact: true }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors text-muted-foreground hover:text-foreground"
                activeProps={{
                  className:
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors bg-muted font-medium text-foreground",
                }}
              >
                <HugeiconsIcon
                  icon={s.icon}
                  size={14}
                  strokeWidth={2}
                  className="shrink-0"
                />
                {s.label}
              </Link>
            ))}
          </div>
        </div>
        <main className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-3xl">
            <Outlet />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-svh bg-background">
      <nav className="w-56 shrink-0 space-y-1 overflow-y-auto border-r border-border p-4">
        <div className="mb-4 px-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="-ml-2 gap-1.5 text-muted-foreground"
          >
            <HugeiconsIcon
              icon={ArrowLeft02Icon}
              size={14}
              strokeWidth={2}
            />
            Back
          </Button>
        </div>
        <h1 className="mb-4 px-3 font-display text-lg font-semibold tracking-tight">
          Settings
        </h1>
        {SECTIONS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            activeOptions={{ exact: true }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            activeProps={{
              className:
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors bg-muted font-medium text-foreground",
            }}
          >
            <HugeiconsIcon
              icon={s.icon}
              size={16}
              strokeWidth={2}
              className="shrink-0"
            />
            {s.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
