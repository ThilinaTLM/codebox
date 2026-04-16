import { GitHubAppConfigForm } from "./GitHubAppConfigForm"
import { GitHubInstallSection } from "./GitHubInstallSection"
import { GitHubInstallationsList } from "./GitHubInstallationsList"
import { useGitHubInstallations, useGitHubStatus } from "@/net/query"
import { Separator } from "@/components/ui/separator"

interface GitHubSectionProps {
  projectSlug: string
  readOnly?: boolean
}

export function GitHubSection({
  projectSlug,
  readOnly = false,
}: GitHubSectionProps) {
  const slug = projectSlug
  const { data: status, isLoading: statusLoading } = useGitHubStatus(
    slug || undefined
  )
  const { data: installations, isLoading: installationsLoading } =
    useGitHubInstallations(slug || undefined)

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-lg">GitHub</h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Connect a GitHub App to enable issue and PR triggers for your agent.
        </p>
      </div>

      <GitHubAppConfigForm
        projectSlug={slug}
        statusLoading={statusLoading}
        readOnly={readOnly}
      />
      {status?.enabled && (
        <>
          <Separator />
          <GitHubInstallSection
            projectSlug={slug}
            appSlug={status.app_slug}
            readOnly={readOnly}
          />
          <GitHubInstallationsList
            projectSlug={slug}
            installations={installations ?? []}
            isLoading={installationsLoading}
            readOnly={readOnly}
          />
        </>
      )}
    </div>
  )
}
