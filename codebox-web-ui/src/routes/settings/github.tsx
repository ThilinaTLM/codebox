import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import type { GitHubInstallation, GitHubRepo } from "@/net/http/types"
import {
  useAddGitHubInstallation,
  useGitHubInstallations,
  useGitHubStatus,
  useRemoveGitHubInstallation,
  useSyncGitHubInstallation,
} from "@/net/query"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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
        <div className="rounded-2xl border border-dashed border-muted-foreground/20 p-8 text-center">
          <h2 className="font-display text-lg font-semibold">
            GitHub Integration Not Configured
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Set{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              GITHUB_APP_ID
            </code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              GITHUB_APP_PRIVATE_KEY_PATH
            </code>{" "}
            environment variables on the orchestrator to enable GitHub App
            integration.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
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
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-y-auto">
      {/* Page header */}
      <div className="bg-hero-gradient px-6 pt-10 pb-8">
        <div className="mx-auto max-w-6xl">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to="/settings" />}>
                  Settings
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>GitHub</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="font-display mt-3 text-4xl font-bold tracking-tight">
            GitHub
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            Connect repositories and manage installations.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl pt-8">{children}</div>
      </div>
    </div>
  )
}

function ConnectSection({ appSlug }: { appSlug: string }) {
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`
  return (
    <section>
      <h2 className="font-display max-w-xs text-lg font-semibold">
        Connect GitHub
      </h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Install the GitHub App on your organization or repositories to enable
        agent triggers from issues and pull requests.
      </p>
      <Button
        className="mt-4"
        nativeButton={false}
        render={
          <a href={installUrl} target="_blank" rel="noopener noreferrer" />
        }
      >
        Install GitHub App
      </Button>
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
      <h2 className="font-display max-w-xs text-lg font-semibold">
        Manual Setup
      </h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        If the callback redirect doesn&apos;t work, you can manually enter a
        GitHub App installation ID.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
        <Input
          type="text"
          value={installationId}
          onChange={(e) => setInstallationId(e.target.value)}
          placeholder="Installation ID"
          className="w-48"
        />
        <Button
          type="submit"
          size="sm"
          disabled={addMutation.isPending || !installationId}
        >
          {addMutation.isPending ? "Adding..." : "Add"}
        </Button>
      </form>
    </section>
  )
}

function InstallationsList({
  installations,
  isLoading,
}: {
  installations: Array<GitHubInstallation>
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <section>
        <h2 className="font-display max-w-xs text-lg font-semibold">
          Connected Installations
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-display max-w-xs text-lg font-semibold">
        Connected Installations
      </h2>
      {installations.length === 0 ? (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          No GitHub App installations connected yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
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
  const [repos, setRepos] = useState<Array<GitHubRepo> | null>(null)

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
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display font-semibold">
              {installation.account_login}
            </p>
            <p className="text-xs text-muted-foreground">
              {installation.account_type} &middot; ID:{" "}
              {installation.installation_id} &middot;{" "}
              {new Date(installation.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={handleSync}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? "Syncing..." : "Sync Repos"}
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={handleRemove}
              disabled={removeMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              Remove
            </Button>
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
                  <Badge variant="outline" className="py-0 text-[10px]">
                    private
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
