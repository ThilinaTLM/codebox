import { useEffect } from "react"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { GitHubSection } from "@/components/settings/GitHubSection"
import { useProjectPermissions } from "@/hooks/useProjectPermissions"

type GitHubSettingsSearch = {
  manifest?: "ok" | "error"
  reason?: string
  installation_id?: string
  error?: string
}

const REASON_MESSAGES: Record<string, string> = {
  missing_params: "GitHub didn't return a code. Please try again.",
  invalid_state: "Registration session expired or was tampered with. Try again.",
  exchange_failed:
    "Failed to exchange the manifest code with GitHub. The code may have expired (1 hour limit).",
  incomplete_response:
    "GitHub returned incomplete credentials. Please try again.",
}

export const Route = createFileRoute(
  "/projects/$projectSlug/configs/github"
)({
  validateSearch: (search: Record<string, unknown>): GitHubSettingsSearch => ({
    manifest:
      search.manifest === "ok" || search.manifest === "error"
        ? search.manifest
        : undefined,
    reason: typeof search.reason === "string" ? search.reason : undefined,
    installation_id:
      typeof search.installation_id === "string"
        ? search.installation_id
        : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: GitHubSettingsPage,
})

function GitHubSettingsPage() {
  const { projectSlug } = Route.useParams()
  const search = useSearch({ from: Route.id })
  const navigate = useNavigate({ from: Route.fullPath })
  const qc = useQueryClient()
  const { canManageProjectSettings } = useProjectPermissions(projectSlug)

  useEffect(() => {
    if (search.manifest === "ok") {
      toast.success("GitHub App created and connected to this project")
      qc.invalidateQueries({
        queryKey: ["projects", projectSlug, "github", "status"],
      })
      qc.invalidateQueries({ queryKey: ["projects", projectSlug, "settings"] })
      void navigate({
        search: (prev) => ({ ...prev, manifest: undefined, reason: undefined }),
        replace: true,
      })
    } else if (search.manifest === "error") {
      const msg =
        (search.reason && REASON_MESSAGES[search.reason]) ||
        "Failed to register GitHub App"
      toast.error(msg)
      void navigate({
        search: (prev) => ({ ...prev, manifest: undefined, reason: undefined }),
        replace: true,
      })
    } else if (search.installation_id) {
      toast.success("GitHub App installation connected")
      qc.invalidateQueries({
        queryKey: ["projects", projectSlug, "github", "installations"],
      })
      void navigate({
        search: (prev) => ({ ...prev, installation_id: undefined }),
        replace: true,
      })
    } else if (search.error) {
      toast.error(`GitHub installation failed: ${search.error}`)
      void navigate({
        search: (prev) => ({ ...prev, error: undefined }),
        replace: true,
      })
    }
  }, [
    search.manifest,
    search.reason,
    search.installation_id,
    search.error,
    projectSlug,
    qc,
    navigate,
  ])

  return (
    <GitHubSection
      projectSlug={projectSlug}
      readOnly={!canManageProjectSettings}
    />
  )
}
