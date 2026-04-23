import { toast } from "sonner"
import { useAutomationFormState } from "./useAutomationFormState"
import { BasicsSection } from "./sections/BasicsSection"
import { TriggerSection } from "./sections/TriggerSection"
import { WorkspaceSection } from "./sections/WorkspaceSection"
import { PromptsSection } from "./sections/PromptsSection"
import { AgentSection } from "./sections/AgentSection"
import { AutomationConfigurationTabRail } from "./AutomationConfigurationTabRail"
import type { Automation } from "@/net/http/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useGitHubStatus, useUpdateAutomation } from "@/net/query"

interface AutomationConfigurationTabProps {
  projectSlug: string
  automation: Automation
  readOnly?: boolean
}

export function AutomationConfigurationTab({
  projectSlug,
  automation,
  readOnly = false,
}: AutomationConfigurationTabProps) {
  const form = useAutomationFormState({ automation })
  const { data: ghStatus } = useGitHubStatus(projectSlug)
  const githubConfigured = Boolean(ghStatus?.enabled)
  const updateMutation = useUpdateAutomation(projectSlug)

  const handleSave = () => {
    if (!form.isValid) return
    const patch = form.toUpdatePayload(automation)
    if (Object.keys(patch).length === 0) return
    updateMutation.mutate(
      { id: automation.id, payload: patch },
      {
        onSuccess: () => {
          toast.success("Automation updated")
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "response" in err
              ? (err as { response?: { data?: { detail?: string } } })
                  .response?.data?.detail
              : null
          toast.error(msg || "Failed to update automation")
        },
      }
    )
  }

  const handleDiscard = () => {
    form.dispatch({ type: "reset", state: form.initial })
  }

  return (
    <div className="relative">
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <AutomationConfigurationTabRail status={form.sectionStatus} />
        </aside>

        <fieldset
          disabled={readOnly}
          className={cn(
            "min-w-0 space-y-5",
            readOnly && "pointer-events-none opacity-60"
          )}
        >
          <BasicsSection
            id="section-basics"
            state={form.state}
            dispatch={form.dispatch}
            errors={form.errors}
          />
          <TriggerSection
            id="section-trigger"
            projectSlug={projectSlug}
            state={form.state}
            dispatch={form.dispatch}
            errors={form.errors}
            nextRunAt={automation.next_run_at}
            githubConfigured={githubConfigured}
          />
          <WorkspaceSection
            id="section-workspace"
            projectSlug={projectSlug}
            state={form.state}
            dispatch={form.dispatch}
            errors={form.errors}
            githubConfigured={githubConfigured}
          />
          <PromptsSection
            id="section-prompts"
            state={form.state}
            dispatch={form.dispatch}
            errors={form.errors}
          />
          <AgentSection
            id="section-agent"
            projectSlug={projectSlug}
            state={form.state}
            dispatch={form.dispatch}
          />
          {/* Leave space for the sticky footer */}
          <div className="h-16" />
        </fieldset>
      </div>

      {form.isDirty && !readOnly && (
        <div
          className="sticky bottom-0 z-10 -mx-2 mt-4 flex items-center justify-end gap-2 rounded-xl border border-border/60 bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
          role="region"
          aria-live="polite"
          aria-label="Unsaved changes"
        >
          <span className="mr-auto text-xs text-muted-foreground">
            You have unsaved changes.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={updateMutation.isPending}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!form.isValid || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  )
}
