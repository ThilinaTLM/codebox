import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"
import type { SectionStatus } from "./useAgentTemplateFormState"
import { cn } from "@/lib/utils"

export interface WizardStepSpec {
  id: string
  title: string
  description: string
  status: SectionStatus
}

interface AgentTemplateWizardRailProps {
  steps: ReadonlyArray<WizardStepSpec>
  activeIndex: number
  furthestIndex: number
  onGo: (index: number) => void
}

export function AgentTemplateWizardRail({
  steps,
  activeIndex,
  furthestIndex,
  onGo,
}: AgentTemplateWizardRailProps) {
  return (
    <nav aria-label="Template wizard steps">
      <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {steps.map((step, idx) => {
          const active = idx === activeIndex
          const reachable = idx <= furthestIndex
          return (
            <li key={step.id} className="flex-1 lg:flex-initial">
              <button
                type="button"
                onClick={() => reachable && onGo(idx)}
                disabled={!reachable}
                data-active={active ? "true" : undefined}
                data-status={step.status}
                className={cn(
                  "group/step flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors outline-none",
                  "enabled:hover:border-border/50 enabled:hover:bg-muted/40",
                  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  "data-[active=true]:border-border/60 data-[active=true]:bg-muted/60",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <StepMarker index={idx} status={step.status} active={active} />
                <div className="min-w-0 space-y-0.5">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      active
                        ? "text-foreground"
                        : "text-foreground/80 group-hover/step:text-foreground"
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="hidden truncate text-xs text-muted-foreground lg:block">
                    {step.description}
                  </p>
                </div>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function StepMarker({
  index,
  status,
  active,
}: {
  index: number
  status: SectionStatus
  active: boolean
}) {
  const base =
    "relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors"
  if (status === "complete") {
    return (
      <span
        className={cn(
          base,
          "border-primary/60 bg-primary/10 text-primary"
        )}
      >
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className="size-3.5"
        />
      </span>
    )
  }
  if (status === "error") {
    return (
      <span
        className={cn(
          base,
          "border-destructive/60 bg-destructive/10 text-destructive"
        )}
      >
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={2}
          className="size-3.5"
        />
      </span>
    )
  }
  return (
    <span
      className={cn(
        base,
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground"
      )}
    >
      {index + 1}
    </span>
  )
}
