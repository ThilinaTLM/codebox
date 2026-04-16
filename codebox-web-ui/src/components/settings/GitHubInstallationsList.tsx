import { useState } from "react"
import { toast } from "sonner"
import { StepHeader } from "./StepHeader"
import type { GitHubInstallation, GitHubRepo } from "@/net/http/types"
import { useProjectStore } from "@/lib/project"
import {
  useRemoveGitHubInstallation,
  useSyncGitHubInstallation,
} from "@/net/query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

interface GitHubInstallationsListProps {
  installations: Array<GitHubInstallation>
  isLoading: boolean
}

export function GitHubInstallationsList({
  installations,
  isLoading,
}: GitHubInstallationsListProps) {
  if (isLoading) {
    return (
      <section className="space-y-4">
        <StepHeader
          step={3}
          title="Manage Installations"
          description="View and manage your connected GitHub App installations."
        />
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <StepHeader
        step={3}
        title="Manage Installations"
        description="View and manage your connected GitHub App installations."
      />
      {installations.length === 0 ? (
        <p className="ml-10 max-w-md text-sm text-muted-foreground">
          No GitHub App installations connected yet.
        </p>
      ) : (
        <div className="space-y-3">
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
  const slug = useProjectStore((s) => s.currentProject?.slug) ?? ""
  const syncMutation = useSyncGitHubInstallation(slug)
  const removeMutation = useRemoveGitHubInstallation(slug)
  const [repos, setRepos] = useState<Array<GitHubRepo> | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

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
      onSuccess: () => {
        toast.success("Installation removed")
        setConfirmRemove(false)
      },
      onError: () => toast.error("Failed to remove installation"),
    })
  }

  return (
    <>
      <Card className="rounded-lg border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display">{installation.account_login}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {installation.account_type} &middot; ID:{" "}
                {installation.installation_id} &middot;{" "}
                {new Date(installation.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? "Syncing..." : "Sync Repos"}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setConfirmRemove(true)}
                disabled={removeMutation.isPending}
                className="text-destructive hover:text-destructive"
              >
                Remove
              </Button>
            </div>
          </div>
          {repos && repos.length > 0 && (
            <div className="mt-3 max-h-60 space-y-1 overflow-y-auto">
              {repos.map((repo) => (
                <div
                  key={repo.full_name}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="font-mono">{repo.full_name}</span>
                  {repo.private && (
                    <Badge variant="outline" className="py-0 text-xs">
                      private
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Installation</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the installation for &ldquo;
              {installation.account_login}&rdquo;? This will disconnect the
              GitHub App from this account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
