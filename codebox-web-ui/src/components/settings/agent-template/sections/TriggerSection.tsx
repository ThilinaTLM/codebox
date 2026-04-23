import { HugeiconsIcon } from "@hugeicons/react"
import {
  TRIGGER_KINDS
  
} from "../metadata"
import { FormField, SectionCard } from "../FormField"
import { FilterBuilder } from "../filter-builder/FilterBuilder"
import { CronBuilder } from "../cron-builder/CronBuilder"
import type {TriggerKindMeta} from "../metadata";
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAgentTemplateFormState"
import type { AgentTemplateTriggerKind } from "@/net/http/types"
import type { Dispatch } from "react"
import { cn } from "@/lib/utils"

interface TriggerSectionProps {
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
  nextRunAt?: string | null
  id?: string
}

export function TriggerSection({
  state,
  dispatch,
  errors,
  nextRunAt,
  id,
}: TriggerSectionProps) {
  const isScheduled = state.trigger_kind === "schedule"

  return (
    <SectionCard
      id={id}
      title="Trigger"
      description="Choose the event that spawns an agent, then narrow it with filters or a schedule."
    >
      <FormField label="Trigger kind" description="Select one.">
        <TriggerKindPicker
          value={state.trigger_kind}
          onChange={(kind) => dispatch({ type: "setTrigger", kind })}
        />
      </FormField>

      {isScheduled ? (
        <CronBuilder
          cron={state.schedule_cron}
          timezone={state.schedule_timezone}
          onCronChange={(next) =>
            dispatch({ type: "set", patch: { schedule_cron: next } })
          }
          onTimezoneChange={(next) =>
            dispatch({ type: "set", patch: { schedule_timezone: next } })
          }
          nextRunAt={nextRunAt}
          cronError={errors.schedule_cron}
          timezoneError={errors.schedule_timezone}
        />
      ) : (
        <FilterBuilder
          triggerKind={state.trigger_kind}
          filters={state.trigger_filters}
          errors={errors.trigger_filters}
          onAdd={() => dispatch({ type: "addFilter" })}
          onRemove={(index) => dispatch({ type: "removeFilter", index })}
          onUpdate={(index, patch) =>
            dispatch({ type: "updateFilter", index, patch })
          }
        />
      )}
    </SectionCard>
  )
}

interface TriggerKindPickerProps {
  value: AgentTemplateTriggerKind
  onChange: (kind: AgentTemplateTriggerKind) => void
}

function TriggerKindPicker({ value, onChange }: TriggerKindPickerProps) {
  const github = TRIGGER_KINDS.filter((t) => t.group === "github")
  const schedule = TRIGGER_KINDS.filter((t) => t.group === "schedule")

  return (
    <div
      className="space-y-4"
      role="radiogroup"
      aria-label="Trigger kind"
    >
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          GitHub events
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {github.map((t) => (
            <TriggerCard
              key={t.value}
              meta={t}
              selected={value === t.value}
              onClick={() => onChange(t.value)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Time-based
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {schedule.map((t) => (
            <TriggerCard
              key={t.value}
              meta={t}
              selected={value === t.value}
              onClick={() => onChange(t.value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function TriggerCard({
  meta,
  selected,
  onClick,
}: {
  meta: TriggerKindMeta
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "group/trigger-card flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-all outline-none",
        "hover:border-border hover:bg-muted/40",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "data-[selected=true]:border-primary data-[selected=true]:bg-primary/5 data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30"
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors",
          "group-data-[selected=true]/trigger-card:bg-primary/10 group-data-[selected=true]/trigger-card:text-primary"
        )}
      >
        <HugeiconsIcon icon={meta.icon} strokeWidth={2} className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{meta.title}</p>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      </div>
    </button>
  )
}
