import { WORKSPACE_MODES, availableWorkspaceModes } from "../metadata"
import { FormField, SectionCard } from "../FormField"
import type { Dispatch } from "react"
import type { AgentTemplateWorkspaceMode } from "@/net/http/types"
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAgentTemplateFormState"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"

interface WorkspaceSectionProps {
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
  id?: string
}

export function WorkspaceSection({
  state,
  dispatch,
  errors,
  id,
}: WorkspaceSectionProps) {
  const available = availableWorkspaceModes(state.trigger_kind)
  const isScheduled = state.trigger_kind === "schedule"
  const isPinned = state.workspace_mode === "pinned" || isScheduled
  const hidden = WORKSPACE_MODES.filter(
    (m) => !available.some((a) => a.value === m.value)
  )

  return (
    <SectionCard
      id={id}
      title="Workspace"
      description="Where the agent does its work — a fresh branch, the event's ref, or a pinned branch."
    >
      <RadioGroup
        value={state.workspace_mode}
        onValueChange={(value) => {
          if (!value) return
          dispatch({
            type: "set",
            patch: {
              workspace_mode: value as AgentTemplateWorkspaceMode,
            },
          })
        }}
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

      {hidden.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {hidden.length === 1
            ? `${hidden[0].title} is not available for this trigger.`
            : `${hidden.length} modes are not available for this trigger.`}
        </p>
      )}

      {isPinned && (
        <div className="grid gap-4 rounded-xl border border-border/50 bg-muted/20 p-4 sm:grid-cols-2">
          <FormField
            label="Repository"
            htmlFor="at-repo"
            required
            error={errors.pinned_repo}
            description="``owner/name`` — e.g. ``my-org/my-repo``."
          >
            <Input
              id="at-repo"
              value={state.pinned_repo}
              onChange={(e) =>
                dispatch({
                  type: "set",
                  patch: { pinned_repo: e.target.value },
                })
              }
              placeholder="my-org/my-repo"
              aria-invalid={!!errors.pinned_repo || undefined}
            />
          </FormField>
          <FormField
            label="Branch"
            htmlFor="at-branch"
            required
            error={errors.pinned_branch}
            description="Branch to check out before the agent runs."
          >
            <Input
              id="at-branch"
              value={state.pinned_branch}
              onChange={(e) =>
                dispatch({
                  type: "set",
                  patch: { pinned_branch: e.target.value },
                })
              }
              placeholder="main"
              aria-invalid={!!errors.pinned_branch || undefined}
            />
          </FormField>
        </div>
      )}
    </SectionCard>
  )
}
