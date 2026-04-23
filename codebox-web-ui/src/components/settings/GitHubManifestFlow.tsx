import { useState } from "react"
import { toast } from "sonner"
import { ExternalLink, Sparkles } from "lucide-react"
import { GitHubLocalDevGuide } from "./GitHubLocalDevGuide"
import { StepHeader } from "./StepHeader"
import { usePrepareGitHubManifest } from "@/net/query"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

interface GitHubManifestFlowProps {
  projectSlug: string
  manifestSupported: boolean
  publicUrl: string | null | undefined
}

type OwnerType = "user" | "organization"

/**
 * Submit a real top-level HTML form POST to GitHub's manifest endpoint.
 *
 * GitHub only accepts the manifest flow as a browser navigation — you can
 * NOT do this with fetch/XHR because the flow depends on the user seeing
 * GitHub's confirmation page.
 */
function submitManifestForm(
  action: string,
  manifest: Record<string, unknown>,
  state: string
): void {
  const form = document.createElement("form")
  form.method = "POST"
  form.action = action
  form.style.display = "none"

  const manifestInput = document.createElement("input")
  manifestInput.type = "hidden"
  manifestInput.name = "manifest"
  manifestInput.value = JSON.stringify(manifest)
  form.appendChild(manifestInput)

  const stateInput = document.createElement("input")
  stateInput.type = "hidden"
  stateInput.name = "state"
  stateInput.value = state
  form.appendChild(stateInput)

  document.body.appendChild(form)
  form.submit()
}

export function GitHubManifestFlow({
  projectSlug,
  manifestSupported,
  publicUrl,
}: GitHubManifestFlowProps) {
  const [ownerType, setOwnerType] = useState<OwnerType>("user")
  const [orgName, setOrgName] = useState("")
  const prepareMutation = usePrepareGitHubManifest(projectSlug)

  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (ownerType === "organization" && !orgName.trim()) {
      toast.error("Enter the organization name")
      return
    }
    prepareMutation.mutate(
      {
        owner_type: ownerType,
        owner_name: ownerType === "organization" ? orgName.trim() : null,
      },
      {
        onSuccess: (data) => {
          submitManifestForm(data.action, data.manifest, data.state)
        },
        onError: (err: unknown) => {
          const msg =
            typeof err === "object" && err !== null && "message" in err
              ? String((err as { message?: string }).message)
              : "Failed to prepare GitHub App manifest"
          toast.error(msg)
        },
      }
    )
  }

  return (
    <section className="space-y-6">
      <StepHeader
        title="Create a GitHub App"
        description="Codebox registers a GitHub App for this project with all the permissions and webhook settings pre-configured. You'll confirm and name it on GitHub, then come back here to install it on your repos."
      />

      {!manifestSupported &&
        (isLocalhost ? (
          <GitHubLocalDevGuide projectSlug={projectSlug} />
        ) : (
          <Alert className="max-w-xl">
            <AlertTitle>Public URL not configured</AlertTitle>
            <AlertDescription>
              <code>CODEBOX_ORCHESTRATOR_PUBLIC_URL</code> is not set on the
              orchestrator. Set it to the public URL of this deployment and
              restart. Or use <em>Use existing GitHub App</em> below.
            </AlertDescription>
          </Alert>
        ))}

      <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
        <fieldset disabled={!manifestSupported} className="space-y-5">
          <div className="space-y-2">
            <Label>Register under</Label>
            <RadioGroup
              value={ownerType}
              onValueChange={(v) => setOwnerType(v as OwnerType)}
              className="gap-2"
            >
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <RadioGroupItem value="user" />
                <span>My personal GitHub account</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <RadioGroupItem value="organization" />
                <span>A GitHub organization</span>
              </label>
            </RadioGroup>
          </div>

          {ownerType === "organization" && (
            <div className="space-y-1.5">
              <Label htmlFor="gh-org-name">Organization name</Label>
              <Input
                id="gh-org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="my-org"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                You need to be an owner (or have App Manager permission) of this
                organization.
              </p>
            </div>
          )}

          {publicUrl && (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Webhooks will be delivered to{" "}
              <code className="break-all font-mono">
                {publicUrl.replace(/\/$/, "")}/api/projects/{projectSlug}
                /github/webhook
              </code>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={prepareMutation.isPending || !manifestSupported}
            >
              {prepareMutation.isPending ? (
                "Preparing…"
              ) : (
                <>
                  <Sparkles className="mr-1.5 size-3.5" />
                  Create GitHub App
                </>
              )}
            </Button>
            <a
              href="https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              How does this work?
              <ExternalLink className="size-3" />
            </a>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
