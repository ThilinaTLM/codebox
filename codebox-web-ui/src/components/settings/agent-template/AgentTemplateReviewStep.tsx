import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { SectionCard } from "./FormField"
import {
  OP_LABELS,
  fieldLabel,
  triggerKindMeta,
  workspaceModeMeta,
} from "./metadata"
import type { FormState } from "./useAgentTemplateFormState"
import { Badge } from "@/components/ui/badge"
import { useLLMProfiles } from "@/net/query"

interface AgentTemplateReviewStepProps {
  projectSlug: string
  state: FormState
  id?: string
}

export function AgentTemplateReviewStep({
  projectSlug,
  state,
  id,
}: AgentTemplateReviewStepProps) {
  const trigger = triggerKindMeta(state.trigger_kind)
  const workspace = workspaceModeMeta(state.workspace_mode)
  const { data: profiles = [] } = useLLMProfiles(projectSlug)
  const profile = profiles.find((p) => p.id === state.llm_profile_id)

  return (
    <SectionCard
      id={id}
      title="Review"
      description="A summary of the template you're about to create."
    >
      <div className="space-y-6">
        <ReviewBlock title="Basics">
          <Row label="Name">{state.name || "—"}</Row>
          {state.description && (
            <Row label="Description">{state.description}</Row>
          )}
          <Row label="Enabled">
            <Badge
              variant={state.enabled ? "default" : "secondary"}
              className="text-[10px]"
            >
              {state.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </Row>
        </ReviewBlock>

        <ReviewBlock title="Trigger">
          <Row label="Kind">
            <span className="flex items-center gap-2">
              <HugeiconsIcon
                icon={trigger.icon}
                strokeWidth={2}
                className="size-4 text-muted-foreground"
              />
              {trigger.title}
            </span>
          </Row>
          {state.trigger_kind === "schedule" ? (
            <>
              <Row label="Cron">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {state.schedule_cron}
                </code>
              </Row>
              <Row label="Timezone">{state.schedule_timezone}</Row>
            </>
          ) : (
            <Row label="Filters">
              {state.trigger_filters.length === 0 ? (
                <span className="text-muted-foreground">
                  Match every event of this kind
                </span>
              ) : (
                <ul className="space-y-1 text-xs">
                  {state.trigger_filters.map((f, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: list is positional
                    <li key={i} className="flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {fieldLabel(f.field)}
                      </Badge>
                      <span className="text-muted-foreground">
                        {OP_LABELS[f.op]}
                      </span>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {Array.isArray(f.value) ? f.value.join(", ") : f.value}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
            </Row>
          )}
        </ReviewBlock>

        <ReviewBlock title="Workspace">
          <Row label="Mode">{workspace.title}</Row>
          {(state.workspace_mode === "pinned" ||
            state.trigger_kind === "schedule") && (
            <>
              <Row label="Repository">
                <code className="font-mono text-xs">
                  {state.pinned_repo || "—"}
                </code>
              </Row>
              <Row label="Branch">
                <code className="font-mono text-xs">
                  {state.pinned_branch || "—"}
                </code>
              </Row>
            </>
          )}
        </ReviewBlock>

        <ReviewBlock title="Prompts">
          {state.system_prompt && (
            <Row label="System">
              <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
                {state.system_prompt}
              </pre>
            </Row>
          )}
          <Row label="Initial">
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
              {state.initial_prompt || "—"}
            </pre>
          </Row>
        </ReviewBlock>

        <ReviewBlock title="Agent">
          <Row label="LLM profile">
            {profile ? (
              <span className="flex items-baseline gap-2">
                {profile.name}
                <span className="text-xs text-muted-foreground">
                  {profile.provider} · {profile.model}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Project default</span>
            )}
          </Row>
        </ReviewBlock>

        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
            className="size-4"
          />
          <span>Ready to create. Review the summary above and submit.</span>
        </div>
      </div>
    </SectionCard>
  )
}

function ReviewBlock({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
        {children}
      </dl>
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </>
  )
}
