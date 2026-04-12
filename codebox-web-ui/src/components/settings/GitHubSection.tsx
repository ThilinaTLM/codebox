import { GitHubAppConfigForm } from "./GitHubAppConfigForm"
import { GitHubInstallSection } from "./GitHubInstallSection"
import { GitHubInstallationsList } from "./GitHubInstallationsList"
import { useGitHubInstallations, useGitHubStatus } from "@/net/query"
import { Separator } from "@/components/ui/separator"

export function GitHubSection() {
  const { data: status, isLoading: statusLoading } = useGitHubStatus()
  const { data: installations, isLoading: installationsLoading } =
    useGitHubInstallations()

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-lg">GitHub</h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Connect a GitHub App to enable issue and PR triggers for your agent.
        </p>
      </div>

      <GitHubAppConfigForm statusLoading={statusLoading} />
      {status?.enabled && (
        <>
          <Separator />
          <GitHubInstallSection appSlug={status.app_slug} />
          <GitHubInstallationsList
            installations={installations ?? []}
            isLoading={installationsLoading}
          />
        </>
      )}
    </div>
  )
}
