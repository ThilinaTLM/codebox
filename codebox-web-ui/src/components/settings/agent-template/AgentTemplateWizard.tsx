import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { AgentTemplateWizardStepper } from "./AgentTemplateWizardStepper"
import { useAgentTemplateFormState } from "./useAgentTemplateFormState"
import { BasicsSection } from "./sections/BasicsSection"
import { TriggerSection } from "./sections/TriggerSection"
import { WorkspaceSection } from "./sections/WorkspaceSection"
import { PromptsSection } from "./sections/PromptsSection"
import { AgentSection } from "./sections/AgentSection"
import { StarterTemplatesRow } from "./StarterTemplatesRow"
import type { WizardStepSpec } from "./AgentTemplateWizardStepper"
import { useCreateAgentTemplate, useGitHubStatus } from "@/net/query"
import { Button } from "@/components/ui/button"

interface AgentTemplateWizardProps {
  projectSlug: string
}

type WizardStepId = "basics" | "trigger" | "prompts"

const STEP_ORDER: ReadonlyArray<WizardStepId> = [
  "basics",
  "trigger",
  "prompts",
]

const STEP_LABELS: Record<
  WizardStepId,
  { title: string; description: string }
> = {
  basics: {
    title: "Basics",
    description: "Name, description, agent settings.",
  },
  trigger: {
    title: "Trigger & Workspace",
    description: "When it runs and where it works.",
  },
  prompts: {
    title: "Prompts",
    description: "What the agent reads when it starts.",
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

  // Step 2 collapses Trigger + Workspace into a single status: error if
  // either has an error, complete only when both are complete.
  const triggerWorkspaceStatus = ((): WizardStepSpec["status"] => {
    const t = form.sectionStatus.trigger
    const w = form.sectionStatus.workspace
    if (t === "error" || w === "error") return "error"
    if (t === "complete" && w === "complete") return "complete"
    if (t === "empty" && w === "empty") return "empty"
    return "partial"
  })()

  // Step 1 collapses Basics + Agent (LLM profile) into a single status.
  const basicsAgentStatus = ((): WizardStepSpec["status"] => {
    const b = form.sectionStatus.basics
    const a = form.sectionStatus.agent
    if (b === "error" || a === "error") return "error"
    if (b === "complete" && a === "complete") return "complete"
    return b
  })()

  const stepStatuses: Record<WizardStepId, WizardStepSpec["status"]> = {
    basics: basicsAgentStatus,
    trigger: triggerWorkspaceStatus,
    prompts: form.sectionStatus.prompts,
  }

  const steps: ReadonlyArray<WizardStepSpec> = STEP_ORDER.map((id) => ({
    id,
    title: STEP_LABELS[id].title,
    description: STEP_LABELS[id].description,
    status: stepStatuses[id],
  }))

  const canContinue = ((): boolean => {
    switch (stepId) {
      case "basics":
        return !form.errors.name && form.state.name.trim().length > 0
      case "trigger":
        return (
          !form.errors.schedule_cron &&
          !form.errors.schedule_timezone &&
          !form.errors.pinned_repo &&
          !form.errors.pinned_branch &&
          !(form.errors.trigger_filters ?? []).some(Boolean)
        )
      case "prompts":
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

  const isLastStep = activeIndex === STEP_ORDER.length - 1

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

      {/* Top horizontal stepper */}
      <AgentTemplateWizardStepper
        steps={steps}
        activeIndex={activeIndex}
        furthestIndex={furthestIndex}
        onGo={goTo}
      />

      <div className="min-w-0 space-y-6">
        {stepId === "basics" && (
          <>
            {!form.isDirty && (
              <StarterTemplatesRow dispatch={form.dispatch} />
            )}
            <BasicsSection
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
        {stepId === "trigger" && (
          <>
            <TriggerSection
              projectSlug={projectSlug}
              state={form.state}
              dispatch={form.dispatch}
              errors={form.errors}
              githubConfigured={githubConfigured}
            />
            <WorkspaceSection
              projectSlug={projectSlug}
              state={form.state}
              dispatch={form.dispatch}
              errors={form.errors}
              githubConfigured={githubConfigured}
            />
          </>
        )}
        {stepId === "prompts" && (
          <PromptsSection
            state={form.state}
            dispatch={form.dispatch}
            errors={form.errors}
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
            {isLastStep ? (
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
  )
}
