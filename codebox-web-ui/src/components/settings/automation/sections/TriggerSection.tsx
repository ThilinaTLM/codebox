import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import {
  TRIGGER_KINDS,
  WORKSPACE_MODES,
  availableWorkspaceModes,
  triggerKindHasActions,
} from "../metadata"
import { FormField } from "../FormField"
import { FilterBuilder } from "../filter-builder/FilterBuilder"
import { CronBuilder } from "../cron-builder/CronBuilder"
import { ActionChipMultiSelect } from "../action-picker/ActionChipMultiSelect"
import { BranchPicker } from "./RepoBranchPickers"
import type { TriggerKindMeta } from "../metadata"
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAutomationFormState"
import type {
  AutomationTriggerKind,
  AutomationWorkspaceMode,
} from "@/net/http/types"
import type { Dispatch } from "react"
import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"

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
  const hasActions = triggerKindHasActions(state.trigger_kind)

  return (
    <>
      <FormField label="Trigger kind" description="Select one.">
        <TriggerKindPicker
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
      ) : hasActions ? (
        <FormField
          label="Actions"
          required
          description="The automation runs only on the actions you pick here. Pick at least one."
          error={errors.trigger_actions}
        >
          <ActionChipMultiSelect
            triggerKind={state.trigger_kind}
            value={state.trigger_actions}
            onToggle={(action) =>
              dispatch({ type: "toggleAction", action })
            }
            error={undefined /* error is rendered by FormField */}
          />
        </FormField>
      ) : null}

      {/* Workspace — advanced */}
      <AdvancedWorkspace
        projectSlug={projectSlug}
        state={state}
        dispatch={dispatch}
        errors={errors}
        githubConfigured={githubConfigured}
      />

      {/* Additional filters — advanced */}
      <AdvancedFilters state={state} dispatch={dispatch} errors={errors} />
    </>
  )
}

// ── Trigger kind picker ────────────────────────────────────────────────

interface TriggerKindPickerProps {
  value: AutomationTriggerKind
  githubConfigured: boolean
  onChange: (kind: AutomationTriggerKind) => void
}

function TriggerKindPicker({
  value,
  githubConfigured,
  onChange,
}: TriggerKindPickerProps) {
  const github = TRIGGER_KINDS.filter((t) => t.group === "github")
  const schedule = TRIGGER_KINDS.filter((t) => t.group === "schedule")

  return (
    <div className="space-y-4" role="radiogroup" aria-label="Trigger kind">
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          GitHub events
        </p>
        {!githubConfigured && (
          <p className="mb-2 text-xs text-muted-foreground">
            Configure a GitHub App in the previous step to enable these
            triggers.
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

// ── Advanced workspace disclosure ──────────────────────────────────────

interface AdvancedWorkspaceProps {
  projectSlug: string
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
  githubConfigured: boolean
}

function AdvancedWorkspace({
  projectSlug,
  state,
  dispatch,
  errors,
  githubConfigured,
}: AdvancedWorkspaceProps) {
  const isScheduled = state.trigger_kind === "schedule"
  const [open, setOpen] = useState(false)
  const available = availableWorkspaceModes(state.trigger_kind)
  const hidden = WORKSPACE_MODES.filter(
    (m) => !available.some((a) => a.value === m.value)
  )
  const isPinned = state.workspace_mode === "pinned"
  const needsBranch = isPinned

  // Summary line for the closed state.
  const modeTitle = WORKSPACE_MODES.find(
    (m) => m.value === state.workspace_mode
  )?.title

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "group/disc flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border/60 bg-background px-3 py-2 text-left text-xs transition-colors",
          "hover:border-border hover:bg-muted/30"
        )}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium text-foreground">Workspace — advanced</p>
          <p className="text-muted-foreground">
            {`${modeTitle}`}
            {isPinned && state.pinned_branch && ` · ${state.pinned_branch}`}
            {!isPinned && " (override only if needed)"}
          </p>
        </div>
        <HugeiconsIcon
          icon={open ? ArrowDown01Icon : ArrowRight01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
          {!isScheduled && (
            <RadioGroup
              value={state.workspace_mode}
              onValueChange={(value) => {
                if (!value) return
                dispatch({
                  type: "set",
                  patch: {
                    workspace_mode: value as AutomationWorkspaceMode,
                  },
                })
              }}
              className="space-y-2"
            >
              {available.map((m) => {
                const selected = state.workspace_mode === m.value
                return (
                  <label
                    key={m.value}
                    data-selected={selected ? "true" : undefined}
                    className={cn(
                      "group/mode flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-background p-3 transition-all",
                      "hover:border-border hover:bg-muted/30",
                      "data-[selected=true]:border-primary data-[selected=true]:bg-primary/5 data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30"
                    )}
                  >
                    <RadioGroupItem value={m.value} className="mt-1" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.description}
                      </p>
                    </div>
                  </label>
                )
              })}
            </RadioGroup>
          )}

          {hidden.length > 0 && !isScheduled && (
            <p className="text-[11px] text-muted-foreground">
              {hidden.length === 1
                ? `${hidden[0].title} is not available for this trigger.`
                : `${hidden.length} modes are not available for this trigger.`}
            </p>
          )}

          {needsBranch && (
            <FormField
              label="Branch"
              htmlFor="at-pinned-branch"
              required
              error={errors.pinned_branch}
              description={
                githubConfigured
                  ? "Pick an existing branch of the target repo."
                  : "Branch to check out before the agent runs."
              }
            >
              <BranchPicker
                id="at-pinned-branch"
                projectSlug={projectSlug}
                githubConfigured={githubConfigured}
                repo={state.trigger_repo}
                value={state.pinned_branch}
                onChange={(next) =>
                  dispatch({
                    type: "set",
                    patch: { pinned_branch: next },
                  })
                }
                invalid={!!errors.pinned_branch}
              />
            </FormField>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ── Advanced filters disclosure ────────────────────────────────────────

interface AdvancedFiltersProps {
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
}

function AdvancedFilters({ state, dispatch, errors }: AdvancedFiltersProps) {
  const [open, setOpen] = useState(state.trigger_filters.length > 0)
  const count = state.trigger_filters.length

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border/60 bg-background px-3 py-2 text-left text-xs transition-colors",
          "hover:border-border hover:bg-muted/30"
        )}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium text-foreground">Advanced filters</p>
          <p className="text-muted-foreground">
            {count === 0
              ? "Optional — narrow matching by labels, author, branch, etc."
              : `${count} filter${count > 1 ? "s" : ""} configured.`}
          </p>
        </div>
        <HugeiconsIcon
          icon={open ? ArrowDown01Icon : ArrowRight01Icon}
          strokeWidth={2}
          className="size-4 shrink-0 text-muted-foreground"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
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
      </CollapsibleContent>
    </Collapsible>
  )
}
