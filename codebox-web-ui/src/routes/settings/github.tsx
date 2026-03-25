import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  useGitHubStatus,
  useGitHubInstallations,
  useAddGitHubInstallation,
  useSyncGitHubInstallation,
  useRemoveGitHubInstallation,
} from "@/net/query"
import type { GitHubInstallation, GitHubRepo } from "@/net/http/types"
import { toast } from "sonner"

export const Route = createFileRoute("/settings/github")({
  component: GitHubSettingsPage,
})

function GitHubSettingsPage() {
  const { data: status, isLoading: statusLoading } = useGitHubStatus()
  const { data: installations, isLoading: installationsLoading } =
    useGitHubInstallations()

  if (statusLoading) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </PageShell>
    )
  }

  return (
    <PageShell>
      {!status?.enabled ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <h2 className="text-lg font-medium">GitHub Integration Not Configured</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GITHUB_APP_ID</code> and{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GITHUB_APP_PRIVATE_KEY_PATH</code>{" "}
            environment variables on the orchestrator to enable GitHub App integration.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <ConnectSection appSlug={status.app_slug} />
          <ManualInstallSection />
          <InstallationsList
            installations={installations ?? []}
            isLoading={installationsLoading}
          />
        </div>
      )}
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <SidebarTrigger />
        <h1 className="text-xl font-semibold tracking-tight">
          Settings &mdash; GitHub
        </h1>
      </div>
      <div className="mx-auto w-full max-w-3xl p-6">{children}</div>
    </div>
  )
}

function ConnectSection({ appSlug }: { appSlug: string }) {
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`
  return (
    <section>
      <h2 className="text-lg font-medium">Connect GitHub</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Install the GitHub App on your organization or repositories to enable
        agent triggers from issues and pull requests.
      </p>
      <a
        href={installUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Install GitHub App
      </a>
    </section>
  )
}

function ManualInstallSection() {
  const [installationId, setInstallationId] = useState("")
  const addMutation = useAddGitHubInstallation()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const id = parseInt(installationId, 10)
    if (isNaN(id)) {
      toast.error("Invalid installation ID")
      return
    }
    addMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Installation added")
        setInstallationId("")
      },
      onError: () => toast.error("Failed to add installation"),
    })
  }

  return (
    <section>
      <h2 className="text-lg font-medium">Manual Setup</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        If the callback redirect doesn&apos;t work, you can manually enter a
        GitHub App installation ID.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={installationId}
          onChange={(e) => setInstallationId(e.target.value)}
          placeholder="Installation ID"
          className="h-9 rounded-md border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          disabled={addMutation.isPending || !installationId}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {addMutation.isPending ? "Adding..." : "Add"}
        </button>
      </form>
    </section>
  )
}

function InstallationsList({
  installations,
  isLoading,
}: {
  installations: GitHubInstallation[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <section>
        <h2 className="text-lg font-medium">Connected Installations</h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="text-lg font-medium">Connected Installations</h2>
      {installations.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No GitHub App installations connected yet.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {installations.map((inst) => (
            <InstallationCard key={inst.id} installation={inst} />
          ))}
        </div>
      )}
    </section>
  )
}

function InstallationCard({
  installation,
}: {
  installation: GitHubInstallation
}) {
  const syncMutation = useSyncGitHubInstallation()
  const removeMutation = useRemoveGitHubInstallation()
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null)

  const handleSync = () => {
    syncMutation.mutate(installation.id, {
      onSuccess: (data) => {
        setRepos(data)
        toast.success(`Synced ${data.length} repos`)
      },
      onError: () => toast.error("Failed to sync repos"),
    })
  }

  const handleRemove = () => {
    removeMutation.mutate(installation.id, {
      onSuccess: () => toast.success("Installation removed"),
      onError: () => toast.error("Failed to remove installation"),
    })
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{installation.account_login}</p>
          <p className="text-xs text-muted-foreground">
            {installation.account_type} &middot; ID: {installation.installation_id} &middot;{" "}
            {new Date(installation.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="h-8 rounded-md border px-3 text-xs hover:bg-muted disabled:opacity-50"
          >
            {syncMutation.isPending ? "Syncing..." : "Sync Repos"}
          </button>
          <button
            onClick={handleRemove}
            disabled={removeMutation.isPending}
            className="h-8 rounded-md border px-3 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>
      {repos && repos.length > 0 && (
        <div className="mt-3 space-y-1">
          {repos.map((repo) => (
            <div
              key={repo.full_name}
              className="flex items-center gap-2 text-sm"
            >
              <span>{repo.full_name}</span>
              {repo.private && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  private
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
