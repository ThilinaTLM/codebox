import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  TRIGGER_KINDS
  
} from "../metadata"
import { FormField } from "../FormField"
import { FilterBuilder } from "../filter-builder/FilterBuilder"
import { CronBuilder } from "../cron-builder/CronBuilder"
import type {TriggerKindMeta} from "../metadata";
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAutomationFormState"
import type { AutomationTriggerKind } from "@/net/http/types"
import type { Dispatch } from "react"
import { cn } from "@/lib/utils"

interface TriggerFieldsProps {
  projectSlug: string
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
  nextRunAt?: string | null
  githubConfigured: boolean
}

export function TriggerFields({
  projectSlug,
  state,
  dispatch,
  errors,
  nextRunAt,
  githubConfigured,
}: TriggerFieldsProps) {
  const isScheduled = state.trigger_kind === "schedule"

  return (
    <>
      <FormField label="Trigger kind" description="Select one.">
        <TriggerKindPicker
          projectSlug={projectSlug}
          value={state.trigger_kind}
          githubConfigured={githubConfigured}
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
    </>
  )
}


interface TriggerKindPickerProps {
  projectSlug: string
  value: AutomationTriggerKind
  githubConfigured: boolean
  onChange: (kind: AutomationTriggerKind) => void
}

function TriggerKindPicker({
  projectSlug,
  value,
  githubConfigured,
  onChange,
}: TriggerKindPickerProps) {
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
        {!githubConfigured && (
          <p className="mb-2 text-xs text-muted-foreground">
            No GitHub App is configured for this project.{" "}
            <Link
              to="/projects/$projectSlug/configs/github"
              params={{ projectSlug }}
              search={{ tab: "app" }}
              className="font-medium underline underline-offset-2 hover:text-foreground"
            >
              Configure a GitHub App
            </Link>{" "}
            to enable these triggers.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {github.map((t) => (
            <TriggerCard
              key={t.value}
              meta={t}
              selected={value === t.value}
              disabled={!githubConfigured}
              onClick={() => {
                if (!githubConfigured) return
                onChange(t.value)
              }}
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
  disabled = false,
  onClick,
}: {
  meta: TriggerKindMeta
  selected: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={onClick}
      data-selected={selected ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      className={cn(
        "group/trigger-card flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 text-left transition-all outline-none",
        "hover:border-border hover:bg-muted/40",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "data-[selected=true]:border-primary data-[selected=true]:bg-primary/5 data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30",
        "data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 data-[disabled=true]:hover:border-border/60 data-[disabled=true]:hover:bg-background"
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
