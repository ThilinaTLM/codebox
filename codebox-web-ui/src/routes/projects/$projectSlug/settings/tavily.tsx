import { createFileRoute } from "@tanstack/react-router"
import { TavilySection } from "@/components/settings/TavilySection"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

export const Route = createFileRoute(
  "/projects/$projectSlug/settings/tavily"
)({
  component: TavilySettingsPage,
})

function TavilySettingsPage() {
  const { projectSlug } = Route.useParams()
  const { canManageProjectSettings } = useProjectPermissions(projectSlug)
  return (
    <TavilySection
      projectSlug={projectSlug}
      readOnly={!canManageProjectSettings}
    />
  )
}
