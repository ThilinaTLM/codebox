import { createFileRoute, useNavigate } from "@tanstack/react-router"
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
import { cn } from "@/lib/utils"
import { AccountSection } from "@/components/settings/AccountSection"
import { AppearanceSection } from "@/components/settings/AppearanceSection"
import { GitHubSection } from "@/components/settings/GitHubSection"
import { LLMProfilesSection } from "@/components/settings/LLMProfilesSection"
import { TavilySection } from "@/components/settings/TavilySection"

// ── Route ───────────────────────────────────────────────────

const VALID_SECTIONS = [
  "account",
  "appearance",
  "llm-profiles",
  "github",
  "tavily",
] as const
type SettingsSection = (typeof VALID_SECTIONS)[number]

const SECTIONS: Array<{
  id: SettingsSection
  label: string
  icon: IconSvgElement
}> = [
  { id: "account", label: "Account", icon: UserCircleIcon },
  { id: "appearance", label: "Appearance", icon: PaintBoardIcon },
  { id: "llm-profiles", label: "LLM Profiles", icon: AiBrain01Icon },
  { id: "github", label: "GitHub", icon: Github01Icon },
  { id: "tavily", label: "Tavily", icon: InternetIcon },
]

export const Route = createFileRoute("/settings/")({
  validateSearch: (
    search: Record<string, unknown>
  ): { tab: SettingsSection } => {
    const tab = VALID_SECTIONS.includes(search.tab as SettingsSection)
      ? (search.tab as SettingsSection)
      : "account"
    return { tab }
  },
  component: SettingsPage,
})

// ── Main Layout ─────────────────────────────────────────────

function SettingsPage() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const setSection = (id: SettingsSection) => {
    navigate({
      to: "/settings",
      search: { tab: id },
      replace: true,
    })
  }

  const renderSection = () => {
    switch (tab) {
      case "account":
        return <AccountSection />
      case "appearance":
        return <AppearanceSection />
      case "llm-profiles":
        return <LLMProfilesSection />
      case "github":
        return <GitHubSection />
      case "tavily":
        return <TavilySection />
    }
  }

  if (isMobile) {
    return (
      <div className="flex h-[calc(100svh-24px)] flex-col">
        {/* Top tab bar on mobile */}
        <div className="shrink-0 border-b border-border">
          <div className="flex gap-1 overflow-x-auto px-4 py-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  tab === s.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <HugeiconsIcon
                  icon={s.icon}
                  size={14}
                  strokeWidth={2}
                  className={cn(
                    "shrink-0",
                    tab === s.id && "text-primary"
                  )}
                />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-3xl">{renderSection()}</div>
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
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              tab === s.id
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            )}
          >
            <HugeiconsIcon
              icon={s.icon}
              size={16}
              strokeWidth={2}
              className={cn(
                "shrink-0",
                tab === s.id && "text-primary"
              )}
            />
            {s.label}
          </button>
        ))}
      </nav>

      {/* Right content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">{renderSection()}</div>
      </main>
    </div>
  )
}
