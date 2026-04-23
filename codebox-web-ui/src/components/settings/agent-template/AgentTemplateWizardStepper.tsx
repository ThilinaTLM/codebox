import { Fragment } from "react"
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

interface AgentTemplateWizardStepperProps {
  steps: ReadonlyArray<WizardStepSpec>
  activeIndex: number
  furthestIndex: number
  onGo: (index: number) => void
}

/**
 * Compact single-line horizontal stepper: ``[1] Basics ── [2] Trigger …``.
 * Titles always fit; descriptions live on each step's content area.
 */
export function AgentTemplateWizardStepper({
  steps,
  activeIndex,
  furthestIndex,
  onGo,
}: AgentTemplateWizardStepperProps) {
  return (
    <nav aria-label="Template wizard steps">
      <ol className="flex items-center gap-1">
        {steps.map((step, idx) => {
          const active = idx === activeIndex
          const reachable = idx <= furthestIndex
          const isLast = idx === steps.length - 1
          return (
            <Fragment key={step.id}>
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => reachable && onGo(idx)}
                  disabled={!reachable}
                  data-active={active ? "true" : undefined}
                  data-status={step.status}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "group/step flex items-center gap-2 rounded-full border border-transparent px-2 py-1 text-sm transition-colors outline-none",
                    "enabled:hover:border-border/50 enabled:hover:bg-muted/50",
                    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  <StepMarker
                    index={idx}
                    status={step.status}
                    active={active}
                  />
                  <span
                    className={cn(
                      "whitespace-nowrap font-medium",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground group-hover/step:text-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                </button>
              </li>
              {!isLast && (
                <li
                  aria-hidden
                  className="h-px min-w-4 flex-1 bg-border/60"
                />
              )}
            </Fragment>
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
    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors"
  if (status === "complete") {
    return (
      <span
        className={cn(base, "border-primary/60 bg-primary/10 text-primary")}
      >
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className="size-3"
        />
      </span>
    )
  }
  if (status === "error") {
    return (
      <span
        className={cn(
          base,
          "border-destructive/60 bg-destructive/10 text-destructive",
        )}
      >
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={2}
          className="size-3"
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
          : "border-border bg-background text-muted-foreground",
      )}
    >
      {index + 1}
    </span>
  )
}
