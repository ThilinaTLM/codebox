import { useState } from "react"
import {
  CheckCircle2,
  ChevronRight,
  PencilLine,
  Unplug,
} from "lucide-react"
import { DisconnectGitHubAppDialog } from "./DisconnectGitHubAppDialog"
import { GitHubAppConfigForm } from "./GitHubAppConfigForm"
import { GitHubManifestFlow } from "./GitHubManifestFlow"
import type { ProjectSettings } from "@/net/http/types"
import {
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

interface GitHubAppTabProps {
  projectSlug: string
  readOnly?: boolean
}

export function GitHubAppTab({ projectSlug, readOnly = false }: GitHubAppTabProps) {
  const { data: status, isLoading: statusLoading } = useGitHubStatus(projectSlug)
  const { data: settings } = useProjectSettings(projectSlug)

  const isConfigured = Boolean(status?.enabled)

  if (!isConfigured) {
    return (
      <NotConfiguredView
        projectSlug={projectSlug}
        statusLoading={statusLoading}
        manifestSupported={Boolean(status?.manifest_supported)}
        publicUrl={status?.public_url ?? null}
        readOnly={readOnly}
      />
    )
  }

  return (
    <ConfiguredView
      projectSlug={projectSlug}
      statusLoading={statusLoading}
      settings={settings}
      appSlug={status?.app_slug ?? null}
      readOnly={readOnly}
    />
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
    <div className="space-y-10">
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
          <p className="mb-4 max-w-xl text-xs text-muted-foreground">
            Use this when the manifest flow can&apos;t reach the orchestrator
            (for example, running on localhost without smee.io) or when bringing
            an existing GitHub App.
          </p>
          <GitHubAppConfigForm
            projectSlug={projectSlug}
            statusLoading={statusLoading}
            readOnly={readOnly}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function ConfiguredView({
  projectSlug,
  statusLoading,
  settings,
  appSlug,
  readOnly,
}: {
  projectSlug: string
  statusLoading: boolean
  settings: ProjectSettings | undefined
  appSlug: string | null
  readOnly: boolean
}) {
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  return (
    <section className="space-y-6">
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
        <div className="ml-10 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReplaceOpen((v) => !v)}
          >
            <PencilLine className="mr-1.5 size-3.5" />
            {replaceOpen ? "Cancel replace" : "Replace credentials"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDisconnectOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Unplug className="mr-1.5 size-3.5" />
            Disconnect &amp; recreate
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

      <DisconnectGitHubAppDialog
        projectSlug={projectSlug}
        appSlug={appSlug}
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
      />
    </section>
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
