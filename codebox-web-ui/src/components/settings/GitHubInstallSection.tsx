import { useState } from "react"
import { toast } from "sonner"
import { ChevronRight } from "lucide-react"
import { StepHeader } from "./StepHeader"
import { useAddGitHubInstallation } from "@/net/query"
import { API_URL } from "@/lib/constants"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"

interface GitHubInstallSectionProps {
  projectSlug: string
  appSlug: string | null
  publicUrl?: string | null
  readOnly?: boolean
}

export function GitHubInstallSection({
  projectSlug,
  appSlug,
  publicUrl,
  readOnly = false,
}: GitHubInstallSectionProps) {
  const webhookBase = publicUrl?.replace(/\/$/, "") ?? API_URL
  const webhookUrl = `${webhookBase}/api/projects/${projectSlug}/github/webhook`
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  const showSmeeHint = !publicUrl && isLocalhost
  const smeeCommand = `pnpm dlx smee-client -u https://smee.io/<your-channel> --target http://localhost:9090/api/projects/${projectSlug}/github/webhook`

  return (
    <section className="space-y-6">
      <StepHeader
        title="Install on GitHub"
        description="Copy the webhook URL into your GitHub App settings, then install the app on your organization or repositories."
      />

      <div className="max-w-xl rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">
          Webhook URL
        </p>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 truncate font-mono text-sm">
            {webhookUrl}
          </code>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl)
              toast.success("Webhook URL copied")
            }}
          >
            Copy
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure this URL in your GitHub App&apos;s webhook settings.
        </p>
      </div>

      {showSmeeHint && (
        <Alert className="max-w-xl">
          <AlertTitle>Running locally?</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              GitHub can&apos;t reach <code>localhost</code> directly. Forward
              webhooks with{" "}
              <a
                href="https://smee.io"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                smee.io
              </a>
              :
            </p>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                {smeeCommand}
              </code>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  navigator.clipboard.writeText(smeeCommand)
                  toast.success("Command copied")
                }}
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Replace <code>&lt;your-channel&gt;</code> with a channel from
              smee.io, then set{" "}
              <code>CODEBOX_ORCHESTRATOR_PUBLIC_URL</code> to the same smee URL
              and restart the orchestrator to enable the one-click flow.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {!readOnly && (
        <Button
          nativeButton={false}
          render={
            <a href={installUrl} target="_blank" rel="noopener noreferrer" />
          }
        >
          Install GitHub App
        </Button>
      )}

      {!readOnly && <ManualInstallSection projectSlug={projectSlug} />}
    </section>
  )
}

function ManualInstallSection({ projectSlug }: { projectSlug: string }) {
  const [installationId, setInstallationId] = useState("")
  const slug = projectSlug
  const addMutation = useAddGitHubInstallation(slug)

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
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className="size-4 transition-transform [[data-open]_&]:rotate-90" />
        Manual fallback &mdash; enter installation ID by hand
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="mt-3 max-w-xl text-xs text-muted-foreground">
          Use this when the install callback can&apos;t reach the orchestrator
          (for example, running on localhost without smee.io). The installation
          ID appears in the URL after installing the App on GitHub.
        </p>
        <form
          onSubmit={handleSubmit}
          className="mt-3 flex items-center gap-2"
        >
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
      </CollapsibleContent>
    </Collapsible>
  )
}
