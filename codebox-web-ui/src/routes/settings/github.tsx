import { createFileRoute } from "@tanstack/react-router"
import { GitHubSection } from "@/components/settings/GitHubSection"

export const Route = createFileRoute("/settings/github")({
  component: GitHubSection,
})
