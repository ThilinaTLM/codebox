import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import {
  AgentTemplateWizardRail
  
} from "./AgentTemplateWizardRail"
import { AgentTemplateReviewStep } from "./AgentTemplateReviewStep"
import {
  
  useAgentTemplateFormState
} from "./useAgentTemplateFormState"
import { BasicsSection } from "./sections/BasicsSection"
import { TriggerSection } from "./sections/TriggerSection"
import { WorkspaceSection } from "./sections/WorkspaceSection"
import { PromptsSection } from "./sections/PromptsSection"
import { AgentSection } from "./sections/AgentSection"
import type {SectionId} from "./useAgentTemplateFormState";
import type {WizardStepSpec} from "./AgentTemplateWizardRail";
import { useCreateAgentTemplate, useGitHubStatus } from "@/net/query"
import { Button } from "@/components/ui/button"

interface AgentTemplateWizardProps {
  projectSlug: string
}

type WizardStepId = Exclude<SectionId, "agent"> | "review"

const STEP_ORDER: ReadonlyArray<WizardStepId> = [
  "basics",
  "trigger",
  "workspace",
  "prompts",
  "review",
]

const STEP_LABELS: Record<
  WizardStepId,
  { title: string; description: string }
> = {
  basics: { title: "Basics", description: "Name, description, enabled." },
  trigger: {
    title: "Trigger",
    description: "Which event fires this template.",
  },
  workspace: {
    title: "Workspace",
    description: "Where the agent does its work.",
  },
  prompts: {
    title: "Prompts & agent",
    description: "System + initial prompt, LLM profile.",
  },
  review: {
    title: "Review & create",
    description: "Confirm and create.",
  },
}

export function AgentTemplateWizard({
  projectSlug,
}: AgentTemplateWizardProps) {
  const navigate = useNavigate()
  const { data: ghStatus } = useGitHubStatus(projectSlug)
  const githubConfigured = Boolean(ghStatus?.enabled)
  const form = useAgentTemplateFormState({
    defaultTriggerKind: githubConfigured ? "github.issues" : "schedule",
  })
  const createMutation = useCreateAgentTemplate(projectSlug)

  const [activeIndex, setActiveIndex] = useState(0)
  const [furthestIndex, setFurthestIndex] = useState(0)

  const stepId = STEP_ORDER[activeIndex]

  const stepStatuses: Record<WizardStepId, WizardStepSpec["status"]> = {
    basics: form.sectionStatus.basics,
    trigger: form.sectionStatus.trigger,
    workspace: form.sectionStatus.workspace,
    prompts:
      form.sectionStatus.prompts === "complete" &&
      form.sectionStatus.agent === "complete"
        ? "complete"
        : form.sectionStatus.prompts,
    review: form.isValid ? "complete" : "empty",
  }

  const steps: ReadonlyArray<WizardStepSpec> = STEP_ORDER.map((id) => ({
    id,
    title: STEP_LABELS[id].title,
    description: STEP_LABELS[id].description,
    status: stepStatuses[id],
  }))

  // Per-step "can continue" checks
  const canContinue = ((): boolean => {
    switch (stepId) {
      case "basics":
        return !form.errors.name && form.state.name.trim().length > 0
      case "trigger":
        return (
          !form.errors.schedule_cron &&
          !form.errors.schedule_timezone &&
          !(form.errors.trigger_filters ?? []).some(Boolean)
        )
      case "workspace":
        return !form.errors.pinned_repo && !form.errors.pinned_branch
      case "prompts":
        return !form.errors.initial_prompt
      case "review":
        return form.isValid
      default:
        return false
    }
  })()

  const goTo = (index: number) => {
    if (index < 0 || index >= STEP_ORDER.length) return
    setActiveIndex(index)
    setFurthestIndex((f) => Math.max(f, index))
  }

  const handleBack = () => goTo(activeIndex - 1)
  const handleContinue = () => {
    if (!canContinue) return
    if (activeIndex < STEP_ORDER.length - 1) {
      goTo(activeIndex + 1)
      return
    }
    handleSubmit()
  }

  const handleSubmit = () => {
    if (!form.isValid) return
    const payload = form.toCreatePayload()
    createMutation.mutate(payload, {
      onSuccess: (tpl) => {
        toast.success(`Template "${tpl.name}" created`)
        navigate({
          to: "/projects/$projectSlug/configs/agent-templates/$templateId",
          params: { projectSlug, templateId: tpl.id },
        })
      },
      onError: (err: unknown) => {
        const msg =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { data?: { detail?: string } } }).response
                ?.data?.detail
            : null
        toast.error(msg || "Failed to create template")
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Link
          to="/projects/$projectSlug/configs/agent-templates"
          params={{ projectSlug }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
          Agent Templates
        </Link>
        <h2 className="font-display text-xl">New Agent Template</h2>
        <p className="text-sm text-muted-foreground">
          Spawn agents automatically from GitHub events or on a schedule.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <AgentTemplateWizardRail
            steps={steps}
            activeIndex={activeIndex}
            furthestIndex={furthestIndex}
            onGo={goTo}
          />
        </aside>

        <div className="min-w-0 space-y-6">
          {stepId === "basics" && (
            <BasicsSection
              state={form.state}
              dispatch={form.dispatch}
              errors={form.errors}
            />
          )}
          {stepId === "trigger" && (
            <TriggerSection
              projectSlug={projectSlug}
              state={form.state}
              dispatch={form.dispatch}
              errors={form.errors}
              githubConfigured={githubConfigured}
            />
          )}
          {stepId === "workspace" && (
            <WorkspaceSection
              state={form.state}
              dispatch={form.dispatch}
              errors={form.errors}
            />
          )}
          {stepId === "prompts" && (
            <>
              <PromptsSection
                state={form.state}
                dispatch={form.dispatch}
                errors={form.errors}
              />
              <AgentSection
                projectSlug={projectSlug}
                state={form.state}
                dispatch={form.dispatch}
              />
            </>
          )}
          {stepId === "review" && (
            <AgentTemplateReviewStep
              projectSlug={projectSlug}
              state={form.state}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={activeIndex === 0 || createMutation.isPending}
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={createMutation.isPending}
                render={
                  <Link
                    to="/projects/$projectSlug/configs/agent-templates"
                    params={{ projectSlug }}
                  />
                }
              >
                Cancel
              </Button>
              {stepId === "review" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!form.isValid || createMutation.isPending}
                >
                  {createMutation.isPending
                    ? "Creating…"
                    : "Create template"}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleContinue}
                  disabled={!canContinue}
                >
                  Continue
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    data-icon="inline-end"
                  />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
