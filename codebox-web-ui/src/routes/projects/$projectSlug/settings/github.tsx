import { createFileRoute } from "@tanstack/react-router"
import { GitHubSection } from "@/components/settings/GitHubSection"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

export const Route = createFileRoute(
  "/projects/$projectSlug/settings/github"
)({
  component: GitHubSettingsPage,
})

function GitHubSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { canManageProjectSettings } = useProjectPermissions(projectSlug)
  return (
    <GitHubSection
      projectSlug={projectSlug}
      readOnly={!canManageProjectSettings}
    />
  )
}
