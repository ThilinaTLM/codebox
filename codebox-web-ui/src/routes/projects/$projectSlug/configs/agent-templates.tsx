import { createFileRoute } from "@tanstack/react-router"
import { AgentTemplatesSection } from "@/components/settings/AgentTemplatesSection"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/agent-templates"
)({
  component: AgentTemplatesPage,
})

function AgentTemplatesPage() {
  const { projectSlug } = Route.useParams()
  const { canManageProjectSettings } = useProjectPermissions(projectSlug)
  return (
    <AgentTemplatesSection
      projectSlug={projectSlug}
      readOnly={!canManageProjectSettings}
    />
  )
}
