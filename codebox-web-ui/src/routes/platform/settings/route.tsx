import { Link, Outlet, createFileRoute } from "@tanstack/react-router"
import {
  InformationCircleIcon,
  PaintBoardIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import { useIsMobile } from "@/hooks/use-mobile"

const SECTIONS: Array<{
  key: string
  label: string
  icon: IconSvgElement
  to: "/platform/settings/appearance" | "/platform/settings/about"
}> = [
  {
    key: "appearance",
    label: "Appearance",
    icon: PaintBoardIcon,
    to: "/platform/settings/appearance",
  },
  {
    key: "about",
    label: "About",
    icon: InformationCircleIcon,
    to: "/platform/settings/about",
  },
]

export const Route = createFileRoute("/platform/settings")({
  component: PlatformSettingsLayout,
})

function PlatformSettingsLayout() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border">
          <div className="flex gap-1 overflow-x-auto px-4 py-2">
            {SECTIONS.map((s) => (
              <Link
                key={s.key}
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
    <div className="flex h-full">
      <nav className="w-52 shrink-0 space-y-1 overflow-y-auto border-r border-border p-4">
        <h1 className="mb-4 px-3 font-display text-lg font-semibold tracking-tight">
          Settings
        </h1>
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
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
