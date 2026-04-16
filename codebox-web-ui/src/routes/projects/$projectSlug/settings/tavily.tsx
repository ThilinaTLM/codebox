import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/projects/$projectSlug/settings/tavily"
)({
  component: TavilySettingsPage,
})

function TavilySettingsPage() {
  const { projectSlug } = Route.useParams()
  return <div>Tavily settings for project: {projectSlug} (migrating...)</div>
}
