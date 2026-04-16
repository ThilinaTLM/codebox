import { createFileRoute } from "@tanstack/react-router"
import { LLMProfilesSection } from "@/components/settings/LLMProfilesSection"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/llm-profiles"
)({
  component: LLMProfilesPage,
})

function LLMProfilesPage() {
  const { projectSlug } = Route.useParams()
  const { canManageProjectSettings } = useProjectPermissions(projectSlug)
  return (
    <LLMProfilesSection
      projectSlug={projectSlug}
      readOnly={!canManageProjectSettings}
    />
  )
}
