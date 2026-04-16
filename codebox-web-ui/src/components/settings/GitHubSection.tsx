import { useState } from "react"
import {
  CheckCircle2,
  ChevronRight,
  PencilLine,
} from "lucide-react"
import { GitHubAppConfigForm } from "./GitHubAppConfigForm"
import { GitHubInstallSection } from "./GitHubInstallSection"
import { GitHubInstallationsList } from "./GitHubInstallationsList"
import { GitHubManifestFlow } from "./GitHubManifestFlow"
import type {
  GitHubInstallation,
  ProjectSettings,
} from "@/net/http/types"
import {
  useGitHubInstallations,
  useGitHubStatus,
  useProjectSettings,
} from "@/net/query"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
  const { data: settings } = useProjectSettings(slug || undefined)
  const { data: installations, isLoading: installationsLoading } =
    useGitHubInstallations(slug || undefined)

  const isConfigured = Boolean(status?.enabled)

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-lg">GitHub</h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Connect a GitHub App to enable issue and PR triggers for your agent.
        </p>
      </div>

      {!isConfigured ? (
        <NotConfiguredView
          projectSlug={slug}
          statusLoading={statusLoading}
          manifestSupported={Boolean(status?.manifest_supported)}
          publicUrl={status?.public_url ?? null}
          readOnly={readOnly}
        />
      ) : (
        <ConfiguredView
          projectSlug={slug}
          statusLoading={statusLoading}
          installationsLoading={installationsLoading}
          installations={installations ?? []}
          settings={settings}
          appSlug={status?.app_slug ?? null}
          publicUrl={status?.public_url ?? null}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}

function NotConfiguredView({
  projectSlug,
  statusLoading,
  manifestSupported,
  publicUrl,
  readOnly,
}: {
  projectSlug: string
  statusLoading: boolean
  manifestSupported: boolean
  publicUrl: string | null
  readOnly: boolean
}) {
  if (readOnly) {
    return (
      <p className="text-sm text-muted-foreground">
        GitHub integration is not configured for this project.
      </p>
    )
  }

  return (
    <>
      <GitHubManifestFlow
        projectSlug={projectSlug}
        manifestSupported={manifestSupported}
        publicUrl={publicUrl}
      />

      <Separator />

      <Collapsible>
        <CollapsibleTrigger className="group/trigger flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronRight className="size-4 transition-transform group-data-[state=open]/trigger:rotate-90" />
          Use an existing GitHub App (paste credentials)
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <GitHubAppConfigForm
            projectSlug={projectSlug}
            statusLoading={statusLoading}
            readOnly={readOnly}
          />
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}

function ConfiguredView({
  projectSlug,
  statusLoading,
  installationsLoading,
  installations,
  settings,
  appSlug,
  publicUrl,
  readOnly,
}: {
  projectSlug: string
  statusLoading: boolean
  installationsLoading: boolean
  installations: Array<GitHubInstallation>
  settings: ProjectSettings | undefined
  appSlug: string | null
  publicUrl: string | null
  readOnly: boolean
}) {
  const [replaceOpen, setReplaceOpen] = useState(false)

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
          </span>
          <div className="flex-1">
            <h2 className="font-display text-lg">GitHub App configured</h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              Codebox has credentials for your GitHub App.
              {appSlug && (
                <>
                  {" "}
                  Visit it on GitHub:{" "}
                  <a
                    href={`https://github.com/apps/${appSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-2 hover:text-foreground"
                  >
                    {appSlug}
                  </a>
                  .
                </>
              )}
            </p>
          </div>
        </div>

        <div className="ml-10 grid max-w-xl gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <SummaryRow label="App ID" value={settings?.github_app_id} />
          <SummaryRow label="App slug" value={settings?.github_app_slug} />
          <SummaryRow label="Bot name" value={settings?.github_bot_name} />
          <SummaryRow
            label="Default base branch"
            value={settings?.github_default_base_branch}
          />
          <SummaryRow
            label="Private key"
            value={settings?.github_private_key_masked}
            mono
          />
          <SummaryRow
            label="Webhook secret"
            value={settings?.github_webhook_secret_masked}
            mono
          />
        </div>

        {!readOnly && (
          <div className="ml-10">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReplaceOpen((v) => !v)}
            >
              <PencilLine className="mr-1.5 size-3.5" />
              {replaceOpen ? "Cancel" : "Replace credentials"}
            </Button>
          </div>
        )}

        {replaceOpen && (
          <div className="ml-10">
            <GitHubAppConfigForm
              projectSlug={projectSlug}
              statusLoading={statusLoading}
              readOnly={readOnly}
            />
          </div>
        )}
      </section>

      <Separator />

      <GitHubInstallSection
        projectSlug={projectSlug}
        appSlug={appSlug}
        publicUrl={publicUrl}
        readOnly={readOnly}
      />

      <GitHubInstallationsList
        projectSlug={projectSlug}
        installations={installations}
        isLoading={installationsLoading}
        readOnly={readOnly}
      />
    </>
  )
}

function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={
          mono
            ? "truncate text-right font-mono text-xs"
            : "truncate text-right text-sm"
        }
      >
        {value || "—"}
      </span>
    </div>
  )
}
