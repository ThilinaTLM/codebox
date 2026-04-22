import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import type {
  AgentTemplateCreate,
  AgentTemplateUpdate,
} from "@/net/http/types"
import { AgentTemplateDryRunPanel } from "@/components/settings/AgentTemplateDryRunPanel"
import { AgentTemplateForm } from "@/components/settings/AgentTemplateForm"
import { AgentTemplateRunsList } from "@/components/settings/AgentTemplateRunsList"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"
import { useAgentTemplate, useUpdateAgentTemplate } from "@/net/query"

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/agent-templates/$templateId"
)({
  component: EditAgentTemplatePage,
})

function EditAgentTemplatePage() {
  const { projectSlug, templateId } = Route.useParams()
  const navigate = useNavigate()
  const { canManageProjectSettings, isLoadingPermissions } =
    useProjectPermissions(projectSlug)
  const { data: template, isLoading } = useAgentTemplate(projectSlug, templateId)
  const updateMutation = useUpdateAgentTemplate(projectSlug)

  if (isLoading || isLoadingPermissions) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (!template) {
    return (
      <p className="text-sm text-muted-foreground">Template not found.</p>
    )
  }

  const handleSubmit = (
    payload: AgentTemplateCreate | AgentTemplateUpdate
  ) => {
    updateMutation.mutate(
      { id: template.id, payload: payload as AgentTemplateUpdate },
      {
        onSuccess: () => {
          toast.success("Template updated")
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "response" in err
              ? (err as { response?: { data?: { detail?: string } } })
                  .response?.data?.detail
              : null
          toast.error(msg || "Failed to update template")
        },
      }
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-lg">{template.name}</h2>
        {template.description && (
          <p className="mt-1 text-sm text-muted-foreground">
            {template.description}
          </p>
        )}
      </div>
      <AgentTemplateForm
        projectSlug={projectSlug}
        template={template}
        submitting={updateMutation.isPending}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={() =>
          navigate({
            to: "/projects/$projectSlug/configs/agent-templates",
            params: { projectSlug },
          })
        }
      />
      {canManageProjectSettings && (
        <AgentTemplateDryRunPanel
          projectSlug={projectSlug}
          template={template}
        />
      )}
      <AgentTemplateRunsList
        projectSlug={projectSlug}
        templateId={template.id}
      />
    </div>
  )
}
