import { createFileRoute } from "@tanstack/react-router"
import { AgentTemplateWizard } from "@/components/settings/agent-template/AgentTemplateWizard"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/agent-templates/new"
)({
  component: NewAgentTemplatePage,
})

function NewAgentTemplatePage() {
  const { projectSlug } = Route.useParams()
  const { canManageProjectSettings, isLoadingPermissions } =
    useProjectPermissions(projectSlug)

  if (isLoadingPermissions) {
    return null
  }
  if (!canManageProjectSettings) {
    return (
      <p className="text-sm text-muted-foreground">
        Project admin access required.
      </p>
    )
  }

  return <AgentTemplateWizard projectSlug={projectSlug} />
}
