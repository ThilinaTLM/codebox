import { Link, Outlet, createFileRoute } from "@tanstack/react-router"
import {
  AiBrain01Icon,
  Github01Icon,
  InternetIcon,
  PaintBoardIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import { useIsMobile } from "@/hooks/use-mobile"

// ── Route ───────────────────────────────────────────────────

const SECTIONS: Array<{
  to: string
  label: string
  icon: IconSvgElement
}> = [
  { to: "/settings/account", label: "Account", icon: UserCircleIcon },
  { to: "/settings/appearance", label: "Appearance", icon: PaintBoardIcon },
  { to: "/settings/llm-profiles", label: "LLM Profiles", icon: AiBrain01Icon },
  { to: "/settings/github", label: "GitHub", icon: Github01Icon },
  { to: "/settings/tavily", label: "Tavily", icon: InternetIcon },
]

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
})

// ── Layout ──────────────────────────────────────────────────

function SettingsLayout() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="flex h-[calc(100svh-24px)] flex-col">
        {/* Top tab bar on mobile */}
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
    <div className="flex h-[calc(100svh-24px)]">
      {/* Left nav */}
      <nav className="w-48 shrink-0 space-y-1 overflow-y-auto border-r border-border p-4">
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

      {/* Right content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
