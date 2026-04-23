import { createFileRoute } from "@tanstack/react-router"
import { AgentTemplateList } from "@/components/settings/agent-template/AgentTemplateList"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/agent-templates/"
)({
  component: AgentTemplatesPage,
})

function AgentTemplatesPage() {
  const { projectSlug } = Route.useParams()
  const { canManageProjectSettings } = useProjectPermissions(projectSlug)
  return (
    <AgentTemplateList
      projectSlug={projectSlug}
      readOnly={!canManageProjectSettings}
    />
  )
}
