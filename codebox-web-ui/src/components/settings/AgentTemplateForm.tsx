import { useMemo, useState } from "react"
import type {
  AgentTemplate,
  AgentTemplateCreate,
  AgentTemplateFilterOp,
  AgentTemplateFilterPredicate,
  AgentTemplateTriggerKind,
  AgentTemplateUpdate,
  AgentTemplateWorkspaceMode,
} from "@/net/http/types"
import { useLLMProfiles } from "@/net/query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

// Keep in sync with
// codebox-orchestrator/.../agent_template/application/allowed_fields.py
const ALLOWED_FIELDS: Record<
  AgentTemplateTriggerKind,
  Record<string, "string" | "list" | "bool" | "int">
> = {
  "github.issues": {
    repo: "string",
    action: "string",
    labels: "list",
    author: "string",
    title: "string",
    state: "string",
  },
  "github.issue_comment": {
    repo: "string",
    action: "string",
    labels: "list",
    author: "string",
    comment_author: "string",
    comment_body: "string",
    is_pr: "bool",
  },
  "github.pull_request": {
    repo: "string",
    action: "string",
    labels: "list",
    author: "string",
    title: "string",
    base_ref: "string",
    head_ref: "string",
    draft: "bool",
  },
  "github.pull_request_review": {
    repo: "string",
    action: "string",
    author: "string",
    review_state: "string",
    review_body: "string",
  },
  "github.pull_request_review_comment": {
    repo: "string",
    action: "string",
    author: "string",
    comment_author: "string",
    comment_body: "string",
  },
  "github.push": {
    repo: "string",
    ref: "string",
    pusher: "string",
    commit_count: "int",
  },
  schedule: { repo: "string" },
}

const OPS_BY_TYPE: Record<string, Array<AgentTemplateFilterOp>> = {
  string: ["eq", "in", "matches"],
  list: ["eq", "in", "contains_any", "matches"],
  bool: ["eq"],
  int: ["eq", "in"],
}

const TRIGGER_OPTIONS: Array<{
  value: AgentTemplateTriggerKind
  label: string
}> = [
  { value: "github.issues", label: "GitHub: Issue" },
  { value: "github.issue_comment", label: "GitHub: Issue Comment" },
  { value: "github.pull_request", label: "GitHub: Pull Request" },
  { value: "github.pull_request_review", label: "GitHub: PR Review" },
  {
    value: "github.pull_request_review_comment",
    label: "GitHub: PR Review Comment",
  },
  { value: "github.push", label: "GitHub: Push" },
  { value: "schedule", label: "Scheduled (cron)" },
]

const MODE_OPTIONS: Array<{
  value: AgentTemplateWorkspaceMode
  label: string
}> = [
  { value: "branch_from_issue", label: "Branch from issue" },
  { value: "checkout_ref", label: "Checkout ref" },
  { value: "pinned", label: "Pinned branch" },
]

interface FormState {
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
  llm_profile_id: string | ""
}

function emptyState(): FormState {
  return {
    name: "",
    description: "",
    enabled: true,
    trigger_kind: "github.issues",
    trigger_filters: [],
    schedule_cron: "0 9 * * *",
    schedule_timezone: "UTC",
    workspace_mode: "branch_from_issue",
    pinned_repo: "",
    pinned_branch: "",
    system_prompt: "",
    initial_prompt: "",
    llm_profile_id: "",
  }
}

function fromTemplate(template: AgentTemplate): FormState {
  return {
    name: template.name,
    description: template.description ?? "",
    enabled: template.enabled,
    trigger_kind: template.trigger_kind,
    trigger_filters: template.trigger_filters ?? [],
    schedule_cron: template.schedule_cron ?? "",
    schedule_timezone: template.schedule_timezone ?? "UTC",
    workspace_mode: template.workspace_mode,
    pinned_repo: template.pinned_repo ?? "",
    pinned_branch: template.pinned_branch ?? "",
    system_prompt: template.system_prompt ?? "",
    initial_prompt: template.initial_prompt,
    llm_profile_id: template.llm_profile_id ?? "",
  }
}

interface AgentTemplateFormProps {
  projectSlug: string
  template?: AgentTemplate
  submitting: boolean
  submitLabel: string
  onSubmit: (payload: AgentTemplateCreate | AgentTemplateUpdate) => void
  onCancel: () => void
}

export function AgentTemplateForm({
  projectSlug,
  template,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: AgentTemplateFormProps) {
  const [state, setState] = useState<FormState>(
    template ? fromTemplate(template) : emptyState()
  )
  const { data: profiles = [] } = useLLMProfiles(projectSlug)

  const allowedFields = useMemo(
    () => ALLOWED_FIELDS[state.trigger_kind],
    [state.trigger_kind]
  )

  const isScheduled = state.trigger_kind === "schedule"
  const isPushTrigger = state.trigger_kind === "github.push"

  const handleTriggerChange = (kind: AgentTemplateTriggerKind) => {
    setState((s) => {
      let workspaceMode = s.workspace_mode
      if (kind === "schedule") {
        workspaceMode = "pinned"
      } else if (kind === "github.push" && workspaceMode === "branch_from_issue") {
        workspaceMode = "checkout_ref"
      }
      return {
        ...s,
        trigger_kind: kind,
        workspace_mode: workspaceMode,
        trigger_filters: [],
      }
    })
  }

  const addPredicate = () => {
    const firstField = Object.keys(allowedFields)[0]
    if (!firstField) return
    const fieldType = allowedFields[firstField]
    const firstOp = OPS_BY_TYPE[fieldType][0]
    setState((s) => ({
      ...s,
      trigger_filters: [
        ...s.trigger_filters,
        {
          field: firstField,
          op: firstOp,
          value: fieldType === "list" ? [] : "",
        },
      ],
    }))
  }

  const updatePredicate = (
    index: number,
    patch: Partial<AgentTemplateFilterPredicate>
  ) => {
    setState((s) => {
      const next = [...s.trigger_filters]
      next[index] = { ...next[index], ...patch } as AgentTemplateFilterPredicate
      return { ...s, trigger_filters: next }
    })
  }

  const removePredicate = (index: number) => {
    setState((s) => ({
      ...s,
      trigger_filters: s.trigger_filters.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: AgentTemplateCreate = {
      name: state.name.trim(),
      description: state.description.trim() || null,
      enabled: state.enabled,
      trigger_kind: state.trigger_kind,
      trigger_filters:
        state.trigger_filters.length > 0 ? state.trigger_filters : null,
      schedule_cron: isScheduled ? state.schedule_cron : null,
      schedule_timezone: isScheduled ? state.schedule_timezone : null,
      workspace_mode: state.workspace_mode,
      pinned_repo: state.pinned_repo.trim() || null,
      pinned_branch: state.pinned_branch.trim() || null,
      system_prompt: state.system_prompt.trim() || null,
      initial_prompt: state.initial_prompt,
      llm_profile_id: state.llm_profile_id || null,
    }
    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
          Basics
        </h3>
        <div className="space-y-2">
          <Label htmlFor="at-name">Name</Label>
          <Input
            id="at-name"
            value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            maxLength={255}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="at-description">Description</Label>
          <Textarea
            id="at-description"
            value={state.description}
            onChange={(e) =>
              setState((s) => ({ ...s, description: e.target.value }))
            }
            rows={2}
            maxLength={2048}
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="at-enabled"
            checked={state.enabled}
            onCheckedChange={(checked) =>
              setState((s) => ({ ...s, enabled: checked }))
            }
          />
          <Label htmlFor="at-enabled">Enabled</Label>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
          Trigger
        </h3>
        <div className="space-y-2">
          <Label htmlFor="at-trigger">Trigger kind</Label>
          <NativeSelect
            id="at-trigger"
            value={state.trigger_kind}
            onChange={(e) =>
              handleTriggerChange(e.target.value as AgentTemplateTriggerKind)
            }
            className="w-full"
          >
            {TRIGGER_OPTIONS.map((opt) => (
              <NativeSelectOption key={opt.value} value={opt.value}>
                {opt.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {isScheduled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="at-cron">Cron expression</Label>
              <Input
                id="at-cron"
                value={state.schedule_cron}
                onChange={(e) =>
                  setState((s) => ({ ...s, schedule_cron: e.target.value }))
                }
                placeholder="0 9 * * *"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="at-tz">Timezone</Label>
              <Input
                id="at-tz"
                value={state.schedule_timezone}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    schedule_timezone: e.target.value,
                  }))
                }
                placeholder="UTC"
              />
            </div>
          </div>
        )}

        {!isScheduled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Filters (AND)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPredicate}
                disabled={Object.keys(allowedFields).length === 0}
              >
                Add filter
              </Button>
            </div>
            {state.trigger_filters.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No filters — every event of this kind will match.
              </p>
            ) : (
              <div className="space-y-2">
                {state.trigger_filters.map((pred, idx) => {
                  const fieldType = allowedFields[pred.field] ?? "string"
                  const ops = OPS_BY_TYPE[fieldType] ?? ["eq"]
                  const isListValue = pred.op === "in" || pred.op === "contains_any"
                  return (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
                    >
                      <NativeSelect
                        size="sm"
                        value={pred.field}
                        onChange={(e) => {
                          const newField = e.target.value
                          const newType = allowedFields[newField] ?? "string"
                          const newOps = OPS_BY_TYPE[newType] ?? ["eq"]
                          const newOp = newOps.includes(pred.op)
                            ? pred.op
                            : newOps[0]
                          updatePredicate(idx, {
                            field: newField,
                            op: newOp,
                            value: newType === "list" ? [] : "",
                          })
                        }}
                      >
                        {Object.keys(allowedFields).map((f) => (
                          <NativeSelectOption key={f} value={f}>
                            {f}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <NativeSelect
                        size="sm"
                        value={pred.op}
                        onChange={(e) => {
                          const newOp = e.target.value as AgentTemplateFilterOp
                          const listy = newOp === "in" || newOp === "contains_any"
                          updatePredicate(idx, {
                            op: newOp,
                            value: listy
                              ? Array.isArray(pred.value)
                                ? pred.value
                                : pred.value
                                  ? [pred.value]
                                  : []
                              : Array.isArray(pred.value)
                                ? pred.value.join(",")
                                : pred.value,
                          })
                        }}
                      >
                        {ops.map((op) => (
                          <NativeSelectOption key={op} value={op}>
                            {op}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Input
                        className="h-8 flex-1 min-w-[200px]"
                        value={
                          Array.isArray(pred.value)
                            ? pred.value.join(",")
                            : pred.value
                        }
                        placeholder={
                          isListValue
                            ? "comma,separated,values"
                            : pred.op === "matches"
                              ? "regex"
                              : "value"
                        }
                        onChange={(e) =>
                          updatePredicate(idx, {
                            value: isListValue
                              ? e.target.value
                                  .split(",")
                                  .map((v) => v.trim())
                                  .filter(Boolean)
                              : e.target.value,
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePredicate(idx)}
                      >
                        Remove
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
          Workspace
        </h3>
        <div className="space-y-2">
          <Label htmlFor="at-mode">Workspace mode</Label>
          <NativeSelect
            id="at-mode"
            value={state.workspace_mode}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                workspace_mode: e.target
                  .value as AgentTemplateWorkspaceMode,
              }))
            }
            disabled={isScheduled}
            className="w-full"
          >
            {MODE_OPTIONS.filter((m) => {
              if (isScheduled) return m.value === "pinned"
              if (isPushTrigger) return m.value !== "branch_from_issue"
              return true
            }).map((opt) => (
              <NativeSelectOption key={opt.value} value={opt.value}>
                {opt.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {(state.workspace_mode === "pinned" || isScheduled) && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="at-repo">Pinned repo (owner/name)</Label>
              <Input
                id="at-repo"
                value={state.pinned_repo}
                onChange={(e) =>
                  setState((s) => ({ ...s, pinned_repo: e.target.value }))
                }
                placeholder="my-org/my-repo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="at-branch">Pinned branch</Label>
              <Input
                id="at-branch"
                value={state.pinned_branch}
                onChange={(e) =>
                  setState((s) => ({ ...s, pinned_branch: e.target.value }))
                }
                placeholder="main"
              />
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
          Prompts
        </h3>
        <p className="text-xs text-muted-foreground">
          Use{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            {"${{VAR_NAME}}"}
          </code>{" "}
          to interpolate context variables. See the Agent Templates plan for the
          full list.
        </p>
        <div className="space-y-2">
          <Label htmlFor="at-sys">System prompt (optional)</Label>
          <Textarea
            id="at-sys"
            value={state.system_prompt}
            onChange={(e) =>
              setState((s) => ({ ...s, system_prompt: e.target.value }))
            }
            rows={5}
            className="font-mono"
            maxLength={16 * 1024}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="at-init">Initial prompt</Label>
          <Textarea
            id="at-init"
            value={state.initial_prompt}
            onChange={(e) =>
              setState((s) => ({ ...s, initial_prompt: e.target.value }))
            }
            rows={10}
            className="font-mono"
            maxLength={50 * 1024}
            required
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
          Agent config
        </h3>
        <div className="space-y-2">
          <Label htmlFor="at-profile">LLM profile</Label>
          <NativeSelect
            id="at-profile"
            value={state.llm_profile_id}
            onChange={(e) =>
              setState((s) => ({ ...s, llm_profile_id: e.target.value }))
            }
            className="w-full"
          >
            <NativeSelectOption value="">
              (project default)
            </NativeSelectOption>
            {profiles.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  )
}
