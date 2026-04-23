import { toast } from "sonner"
import { ExternalLink } from "lucide-react"
import { useDisconnectGitHubApp } from "@/net/query"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DisconnectGitHubAppDialogProps {
  projectSlug: string
  appSlug: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDisconnected?: () => void
}

export function DisconnectGitHubAppDialog({
  projectSlug,
  appSlug,
  open,
  onOpenChange,
  onDisconnected,
}: DisconnectGitHubAppDialogProps) {
  const mutation = useDisconnectGitHubApp(projectSlug)
  const advancedUrl = appSlug
    ? `https://github.com/apps/${appSlug}/advanced`
    : null

  const handleDisconnect = () => {
    mutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("GitHub App disconnected from this project")
        onOpenChange(false)
        onDisconnected?.()
      },
      onError: () => {
        toast.error("Failed to disconnect GitHub App")
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect this GitHub App?</DialogTitle>
          <DialogDescription>
            Codebox will clear the stored credentials and remove every
            installation for this project. The GitHub App on github.com is
            <strong> not </strong>
            deleted &mdash; GitHub does not expose an API for that. After
            disconnecting, open the App on GitHub and delete it manually if you
            no longer need it.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <li className="flex items-baseline gap-2">
            <span className="text-muted-foreground">&bull;</span>
            <span>Stored App credentials will be removed.</span>
          </li>
          <li className="flex items-baseline gap-2">
            <span className="text-muted-foreground">&bull;</span>
            <span>All installations connected to this project will be removed.</span>
          </li>
          <li className="flex items-baseline gap-2">
            <span className="text-muted-foreground">&bull;</span>
            <span>
              Agent templates with GitHub triggers will stop firing until you
              reconnect an App.
            </span>
          </li>
        </ul>

        {advancedUrl && (
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              Then on GitHub
            </p>
            <a
              href={advancedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-2 hover:text-foreground"
            >
              Open App settings &rarr; Advanced
              <ExternalLink className="size-3.5" />
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the &ldquo;Delete GitHub App&rdquo; button at the bottom of
              the Advanced page.
            </p>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDisconnect}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
