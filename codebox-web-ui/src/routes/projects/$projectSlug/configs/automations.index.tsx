import { createFileRoute } from "@tanstack/react-router"
import { AutomationList } from "@/components/settings/automation/AutomationList"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/automations/"
)({
  component: AutomationsPage,
})

function AutomationsPage() {
  const { projectSlug } = Route.useParams()
  const { canManageProjectSettings } = useProjectPermissions(projectSlug)
  return (
    <AutomationList
      projectSlug={projectSlug}
      readOnly={!canManageProjectSettings}
    />
  )
}
