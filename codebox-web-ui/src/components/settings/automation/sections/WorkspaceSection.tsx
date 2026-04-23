import { WORKSPACE_MODES, availableWorkspaceModes } from "../metadata"
import { FormField } from "../FormField"
import { BranchPicker, RepoPicker } from "./RepoBranchPickers"
import type { Dispatch } from "react"
import type { AutomationWorkspaceMode } from "@/net/http/types"
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAutomationFormState"
import { cn } from "@/lib/utils"
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"

interface WorkspaceFieldsProps {
  projectSlug: string
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
  githubConfigured: boolean
}

export function WorkspaceFields({
  projectSlug,
  state,
  dispatch,
  errors,
  githubConfigured,
}: WorkspaceFieldsProps) {
  const available = availableWorkspaceModes(state.trigger_kind)
  const isScheduled = state.trigger_kind === "schedule"
  const isPinned = state.workspace_mode === "pinned" || isScheduled
  const hidden = WORKSPACE_MODES.filter(
    (m) => !available.some((a) => a.value === m.value),
  )

  return (
    <>
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
                "data-[selected=true]:border-primary data-[selected=true]:bg-primary/5 data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30",
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
            description={
              githubConfigured
                ? "Pick from connected repos or type ``owner/name``."
                : "``owner/name`` — e.g. ``my-org/my-repo``."
            }
          >
            <RepoPicker
              id="at-repo"
              projectSlug={projectSlug}
              githubConfigured={githubConfigured}
              value={state.pinned_repo}
              onChange={(next, matched) => {
                const patch: Partial<FormState> = { pinned_repo: next }
                // Auto-fill default branch when a known repo is picked and
                // the branch field is still empty.
                if (matched && state.pinned_branch.trim().length === 0) {
                  patch.pinned_branch = matched.default_branch
                }
                dispatch({ type: "set", patch })
              }}
              invalid={!!errors.pinned_repo}
            />
          </FormField>
          <FormField
            label="Branch"
            htmlFor="at-branch"
            required
            error={errors.pinned_branch}
            description={
              githubConfigured
                ? "Pick an existing branch or type a name (auto-created if missing)."
                : "Branch to check out before the agent runs."
            }
          >
            <BranchPicker
              id="at-branch"
              projectSlug={projectSlug}
              githubConfigured={githubConfigured}
              repo={state.pinned_repo}
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
        </div>
      )}
    </>
  )
}

