import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/projects/$projectSlug/settings/llm-profiles"
)({
  component: LLMProfilesPage,
})

function LLMProfilesPage() {
  const { projectSlug } = Route.useParams()
  return <div>LLM Profiles for project: {projectSlug} (migrating...)</div>
}
