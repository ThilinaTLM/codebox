import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/projects/$projectSlug/settings/github"
)({
  component: GitHubSettingsPage,
})

function GitHubSettingsPage() {
  const { projectSlug } = Route.useParams()
  return <div>GitHub settings for project: {projectSlug} (migrating...)</div>
}
