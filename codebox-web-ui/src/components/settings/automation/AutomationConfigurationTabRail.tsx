import type {
  SectionId,
  SectionStatus,
} from "./useAutomationFormState"
import { cn } from "@/lib/utils"

const SECTIONS: ReadonlyArray<{
  id: SectionId
  anchor: string
  title: string
}> = [
  { id: "basics", anchor: "section-basics", title: "Basics" },
  { id: "trigger", anchor: "section-trigger", title: "Trigger" },
  { id: "workspace", anchor: "section-workspace", title: "Workspace" },
  { id: "prompts", anchor: "section-prompts", title: "Prompts" },
  { id: "agent", anchor: "section-agent", title: "Agent" },
]

interface AutomationConfigurationTabRailProps {
  status: Record<SectionId, SectionStatus>
}

export function AutomationConfigurationTabRail({
  status,
}: AutomationConfigurationTabRailProps) {
  return (
    <nav
      aria-label="Configuration sections"
      className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {SECTIONS.map((section) => {
        const s = status[section.id]
        return (
          <a
            key={section.id}
            href={`#${section.anchor}`}
            data-status={s}
            className={cn(
              "group/rail-link flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-foreground/70 transition-colors",
              "hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <StatusDot status={s} />
            <span className="truncate">{section.title}</span>
          </a>
        )
      })}
    </nav>
  )
}

function StatusDot({ status }: { status: SectionStatus }) {
  return (
    <span
      aria-hidden
      data-status={status}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        "data-[status=complete]:bg-primary",
        "data-[status=partial]:bg-primary/50",
        "data-[status=error]:bg-destructive",
        "data-[status=empty]:bg-border"
      )}
    />
  )
}
