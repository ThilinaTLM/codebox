import { createFileRoute } from "@tanstack/react-router"
import { AutomationWizard } from "@/components/settings/automation/AutomationWizard"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/automations/new"
)({
  component: NewAutomationPage,
})

function NewAutomationPage() {
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

  return <AutomationWizard projectSlug={projectSlug} />
}
