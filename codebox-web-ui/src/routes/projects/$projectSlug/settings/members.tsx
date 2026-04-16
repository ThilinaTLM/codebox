import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/projects/$projectSlug/settings/members"
)({
  component: MembersSettingsPage,
})

function MembersSettingsPage() {
  const { projectSlug } = Route.useParams()
  return <div>Members for project: {projectSlug} (migrating...)</div>
}
