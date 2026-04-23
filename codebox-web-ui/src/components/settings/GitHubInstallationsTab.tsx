import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { GitHubInstallSection } from "./GitHubInstallSection"
import { GitHubInstallationsList } from "./GitHubInstallationsList"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  useGitHubInstallations,
  useGitHubStatus,
} from "@/net/query"

interface GitHubInstallationsTabProps {
  projectSlug: string
  readOnly?: boolean
}

export function GitHubInstallationsTab({
  projectSlug,
  readOnly = false,
}: GitHubInstallationsTabProps) {
  const { data: status } = useGitHubStatus(projectSlug)
  const { data: installations, isLoading: installationsLoading } =
    useGitHubInstallations(projectSlug)

  const isConfigured = Boolean(status?.enabled)

  if (!isConfigured) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg">No GitHub App yet</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Configure a GitHub App for this project before installing it on
            repositories.
          </p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={
            <Link
              to="/projects/$projectSlug/configs/github"
              params={{ projectSlug }}
              search={{ tab: "app" }}
            />
          }
        >
          <ArrowLeft className="mr-1.5 size-3.5" />
          Go to GitHub App tab
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <GitHubInstallSection
        projectSlug={projectSlug}
        appSlug={status?.app_slug ?? null}
        publicUrl={status?.public_url ?? null}
        readOnly={readOnly}
      />

      <Separator />

      <GitHubInstallationsList
        projectSlug={projectSlug}
        installations={installations ?? []}
        isLoading={installationsLoading}
        readOnly={readOnly}
      />
    </div>
  )
}
