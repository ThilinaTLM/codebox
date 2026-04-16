import { useState } from "react"
import { toast } from "sonner"
import { ChevronRight } from "lucide-react"
import { StepHeader } from "./StepHeader"
import { useAddGitHubInstallation } from "@/net/query"
import { API_URL } from "@/lib/constants"
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
  readOnly?: boolean
}

export function GitHubInstallSection({
  projectSlug,
  appSlug,
  readOnly = false,
}: GitHubInstallSectionProps) {
  const webhookUrl = `${API_URL}/api/github/webhook`
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`

  return (
    <section className="space-y-6">
      <StepHeader
        step={2}
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
        Having trouble? Enter installation ID manually
      </CollapsibleTrigger>
      <CollapsibleContent>
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
