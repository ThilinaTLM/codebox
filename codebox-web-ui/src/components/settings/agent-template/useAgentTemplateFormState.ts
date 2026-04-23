import { useMemo, useReducer } from "react"
import { ALLOWED_FIELDS, OPS_BY_TYPE } from "./metadata"
import { isValidCron } from "./cronPresets"
import type {
  AgentTemplate,
  AgentTemplateCreate,
  AgentTemplateFilterOp,
  AgentTemplateFilterPredicate,
  AgentTemplateTriggerKind,
  AgentTemplateUpdate,
  AgentTemplateWorkspaceMode,
} from "@/net/http/types"

export type SectionId =
  | "basics"
  | "trigger"
  | "workspace"
  | "prompts"
  | "agent"

export type SectionStatus = "empty" | "partial" | "complete" | "error"

export interface FormState {
  name: string
  description: string
  enabled: boolean
  trigger_kind: AgentTemplateTriggerKind
  trigger_filters: Array<AgentTemplateFilterPredicate>
  schedule_cron: string
  schedule_timezone: string
  workspace_mode: AgentTemplateWorkspaceMode
  pinned_repo: string
  pinned_branch: string
  system_prompt: string
  initial_prompt: string
  llm_profile_id: string
}

export interface FormErrors {
  name?: string
  trigger_filters?: Array<string | undefined>
  schedule_cron?: string
  schedule_timezone?: string
  pinned_repo?: string
  pinned_branch?: string
  initial_prompt?: string
}

export type FormAction =
  | { type: "set"; patch: Partial<FormState> }
  | { type: "setTrigger"; kind: AgentTemplateTriggerKind }
  | { type: "addFilter" }
  | { type: "removeFilter"; index: number }
  | {
      type: "updateFilter"
      index: number
      patch: Partial<AgentTemplateFilterPredicate>
    }
  | { type: "reset"; state: FormState }

function emptyState(): FormState {
  return {
    name: "",
    description: "",
    enabled: true,
    trigger_kind: "github.issues",
    trigger_filters: [],
    schedule_cron: "",
    schedule_timezone: "UTC",
    workspace_mode: "branch_from_issue",
    pinned_repo: "",
    pinned_branch: "",
    system_prompt: "",
    initial_prompt: "",
    llm_profile_id: "",
  }
}

function fromTemplate(t: AgentTemplate): FormState {
  return {
    name: t.name,
    description: t.description ?? "",
    enabled: t.enabled,
    trigger_kind: t.trigger_kind,
    trigger_filters: t.trigger_filters ?? [],
    schedule_cron: t.schedule_cron ?? "",
    schedule_timezone: t.schedule_timezone ?? "UTC",
    workspace_mode: t.workspace_mode,
    pinned_repo: t.pinned_repo ?? "",
    pinned_branch: t.pinned_branch ?? "",
    system_prompt: t.system_prompt ?? "",
    initial_prompt: t.initial_prompt,
    llm_profile_id: t.llm_profile_id ?? "",
  }
}

function reducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "set":
      return { ...state, ...action.patch }

    case "setTrigger": {
      const kind = action.kind
      let workspace_mode = state.workspace_mode
      if (kind === "schedule") {
        workspace_mode = "pinned"
      } else if (
        kind === "github.push" &&
        workspace_mode === "branch_from_issue"
      ) {
        workspace_mode = "checkout_ref"
      } else if (
        (kind === "github.pull_request" ||
          kind === "github.pull_request_review" ||
          kind === "github.pull_request_review_comment") &&
        workspace_mode === "branch_from_issue"
      ) {
        workspace_mode = "checkout_ref"
      }
      const schedule_cron = kind === "schedule"
        ? state.schedule_cron || "0 9 * * *"
        : state.schedule_cron
      return {
        ...state,
        trigger_kind: kind,
        workspace_mode,
        schedule_cron,
        trigger_filters: [],
      }
    }

    case "addFilter": {
      const fields = Object.keys(ALLOWED_FIELDS[state.trigger_kind])
      if (fields.length === 0) return state
      const field = fields[0]
      const fieldType = ALLOWED_FIELDS[state.trigger_kind][field]
      const op: AgentTemplateFilterOp = OPS_BY_TYPE[fieldType][0]
      const value: AgentTemplateFilterPredicate["value"] =
        fieldType === "list" || op === "in" || op === "contains_any" ? [] : ""
      return {
        ...state,
        trigger_filters: [
          ...state.trigger_filters,
          { field, op, value },
        ],
      }
    }

    case "removeFilter":
      return {
        ...state,
        trigger_filters: state.trigger_filters.filter(
          (_, i) => i !== action.index
        ),
      }

    case "updateFilter": {
      const next = state.trigger_filters.slice()
      next[action.index] = {
        ...next[action.index],
        ...action.patch,
      } as AgentTemplateFilterPredicate
      return { ...state, trigger_filters: next }
    }

    case "reset":
      return action.state
  }
}

export function computeErrors(state: FormState): FormErrors {
  const errors: FormErrors = {}
  if (!state.name.trim()) {
    errors.name = "Name is required."
  }
  if (state.trigger_kind === "schedule") {
    if (!state.schedule_cron.trim()) {
      errors.schedule_cron = "Cron expression is required."
    } else if (!isValidCron(state.schedule_cron)) {
      errors.schedule_cron =
        "Expected a 5-field cron expression (e.g. ``0 9 * * *``)."
    }
    if (!state.schedule_timezone.trim()) {
      errors.schedule_timezone = "Timezone is required."
    }
  }
  if (
    state.workspace_mode === "pinned" ||
    state.trigger_kind === "schedule"
  ) {
    if (!state.pinned_repo.trim()) {
      errors.pinned_repo = "Pinned repository is required."
    } else if (!/^[^/\s]+\/[^/\s]+$/.test(state.pinned_repo.trim())) {
      errors.pinned_repo = "Expected ``owner/name`` format."
    }
    if (!state.pinned_branch.trim()) {
      errors.pinned_branch = "Pinned branch is required."
    }
  }
  if (!state.initial_prompt.trim()) {
    errors.initial_prompt = "Initial prompt is required."
  }
  // Per-filter validation
  const filterErrors: Array<string | undefined> = []
  for (const [i, pred] of state.trigger_filters.entries()) {
    if (Array.isArray(pred.value)) {
      if (pred.value.length === 0) {
        filterErrors[i] = "Add at least one value."
      }
    } else if (!pred.value.trim()) {
      filterErrors[i] = "Enter a value."
    } else if (pred.op === "matches") {
      try {
        void new RegExp(pred.value)
      } catch {
        filterErrors[i] = "Invalid regular expression."
      }
    }
  }
  if (filterErrors.length > 0) {
    errors.trigger_filters = filterErrors
  }
  return errors
}

export function computeSectionStatus(
  state: FormState,
  errors: FormErrors
): Record<SectionId, SectionStatus> {
  const isScheduled = state.trigger_kind === "schedule"
  const basicsFilled = state.name.trim().length > 0
  const basicsHasError = !!errors.name
  const triggerValid = isScheduled
    ? !errors.schedule_cron && !errors.schedule_timezone
    : true
  const hasFilterError = (errors.trigger_filters ?? []).some(Boolean)
  const workspaceValid = !errors.pinned_repo && !errors.pinned_branch
  const workspaceHasPinned =
    state.workspace_mode !== "pinned" ||
    (state.pinned_repo.trim().length > 0 &&
      state.pinned_branch.trim().length > 0)
  const promptsValid = !errors.initial_prompt

  return {
    basics: basicsHasError
      ? "error"
      : basicsFilled
        ? "complete"
        : "empty",
    trigger: hasFilterError || !triggerValid ? "error" : "complete",
    workspace: !workspaceValid
      ? "error"
      : workspaceHasPinned
        ? "complete"
        : "partial",
    prompts: !promptsValid
      ? state.initial_prompt.length > 0
        ? "error"
        : "empty"
      : "complete",
    agent: "complete",
  }
}

interface UseAgentTemplateFormStateArgs {
  template?: AgentTemplate
}

export interface AgentTemplateFormStateApi {
  state: FormState
  initial: FormState
  dispatch: React.Dispatch<FormAction>
  errors: FormErrors
  isValid: boolean
  sectionStatus: Record<SectionId, SectionStatus>
  isDirty: boolean
  toCreatePayload: () => AgentTemplateCreate
  toUpdatePayload: (original: AgentTemplate) => AgentTemplateUpdate
}

export function useAgentTemplateFormState({
  template,
}: UseAgentTemplateFormStateArgs = {}): AgentTemplateFormStateApi {
  const initial = useMemo(
    () => (template ? fromTemplate(template) : emptyState()),
    [template]
  )
  const [state, dispatch] = useReducer(reducer, initial)

  const errors = useMemo(() => computeErrors(state), [state])
  const sectionStatus = useMemo(
    () => computeSectionStatus(state, errors),
    [state, errors]
  )

  const isValid = useMemo(() => {
    if (errors.name) return false
    if (errors.schedule_cron) return false
    if (errors.schedule_timezone) return false
    if (errors.pinned_repo) return false
    if (errors.pinned_branch) return false
    if (errors.initial_prompt) return false
    if ((errors.trigger_filters ?? []).some(Boolean)) return false
    return true
  }, [errors])

  const isDirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(initial),
    [state, initial]
  )

  const toCreatePayload = (): AgentTemplateCreate => {
    const isScheduled = state.trigger_kind === "schedule"
    return {
      name: state.name.trim(),
      description: state.description.trim() || null,
      enabled: state.enabled,
      trigger_kind: state.trigger_kind,
      trigger_filters:
        state.trigger_filters.length > 0 ? state.trigger_filters : null,
      schedule_cron: isScheduled ? state.schedule_cron.trim() : null,
      schedule_timezone: isScheduled ? state.schedule_timezone.trim() : null,
      workspace_mode: state.workspace_mode,
      pinned_repo: state.pinned_repo.trim() || null,
      pinned_branch: state.pinned_branch.trim() || null,
      system_prompt: state.system_prompt.trim() || null,
      initial_prompt: state.initial_prompt,
      llm_profile_id: state.llm_profile_id || null,
    }
  }

  const toUpdatePayload = (original: AgentTemplate): AgentTemplateUpdate => {
    const full = toCreatePayload()
    const patch: AgentTemplateUpdate = {}
    if (full.name !== original.name) patch.name = full.name
    if (full.description !== (original.description ?? null))
      patch.description = full.description
    if (full.enabled !== original.enabled) patch.enabled = full.enabled
    if (full.trigger_kind !== original.trigger_kind)
      patch.trigger_kind = full.trigger_kind
    if (
      JSON.stringify(full.trigger_filters) !==
      JSON.stringify(original.trigger_filters ?? null)
    ) {
      patch.trigger_filters = full.trigger_filters
    }
    if (full.schedule_cron !== (original.schedule_cron ?? null))
      patch.schedule_cron = full.schedule_cron
    if (full.schedule_timezone !== (original.schedule_timezone ?? null))
      patch.schedule_timezone = full.schedule_timezone
    if (full.workspace_mode !== original.workspace_mode)
      patch.workspace_mode = full.workspace_mode
    if (full.pinned_repo !== (original.pinned_repo ?? null))
      patch.pinned_repo = full.pinned_repo
    if (full.pinned_branch !== (original.pinned_branch ?? null))
      patch.pinned_branch = full.pinned_branch
    if (full.system_prompt !== (original.system_prompt ?? null))
      patch.system_prompt = full.system_prompt
    if (full.initial_prompt !== original.initial_prompt)
      patch.initial_prompt = full.initial_prompt
    if (full.llm_profile_id !== (original.llm_profile_id ?? null))
      patch.llm_profile_id = full.llm_profile_id
    return patch
  }

  return {
    state,
    initial,
    dispatch,
    errors,
    isValid,
    sectionStatus,
    isDirty,
    toCreatePayload,
    toUpdatePayload,
  }
}
