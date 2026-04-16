import { createFileRoute } from "@tanstack/react-router"
import { ProjectMembersSection } from "@/components/projects/ProjectMembersSection"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

export const Route = createFileRoute(
  "/projects/$projectSlug/settings/members"
)({
  component: MembersSettingsPage,
})

function MembersSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { canManageMembers } = useProjectPermissions(projectSlug)
  return (
    <ProjectMembersSection
      projectSlug={projectSlug}
      readOnly={!canManageMembers}
    />
  )
}
