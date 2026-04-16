import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Upload } from "lucide-react"
import { LabelWithTooltip } from "./LabelWithTooltip"
import { SectionSkeleton } from "./SectionSkeleton"
import { StepHeader } from "./StepHeader"
import { useProjectSettings, useUpdateProjectSettings } from "@/net/query"
import { useProjectStore } from "@/lib/project"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface GitHubAppConfigFormProps {
  statusLoading: boolean
}

export function GitHubAppConfigForm({
  statusLoading,
}: GitHubAppConfigFormProps) {
  const slug = useProjectStore((s) => s.currentProject?.slug) ?? ""
  const { data: settings } = useProjectSettings(slug || undefined)
  const updateMutation = useUpdateProjectSettings(slug)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [appId, setAppId] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [appSlug, setAppSlug] = useState("")
  const [botName, setBotName] = useState("")
  const [defaultBranch, setDefaultBranch] = useState("")
  const [formDirty, setFormDirty] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: seed form once when settings arrive
  useEffect(() => {
    if (!settings || formDirty) return
    setAppId(settings.github_app_id ?? "")
    setAppSlug(settings.github_app_slug ?? "codebox")
    setBotName(settings.github_bot_name ?? "")
    setDefaultBranch(settings.github_default_base_branch ?? "main")
  }, [settings, formDirty])

  const markDirty = () => {
    if (!formDirty) setFormDirty(true)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result
      if (typeof content === "string") {
        setPrivateKey(content)
        markDirty()
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, string | null> = {}

    if (appId !== (settings?.github_app_id ?? ""))
      payload.github_app_id = appId || null
    if (privateKey) payload.github_private_key = privateKey
    if (webhookSecret) payload.github_webhook_secret = webhookSecret
    if (appSlug !== (settings?.github_app_slug ?? ""))
      payload.github_app_slug = appSlug || null
    if (botName !== (settings?.github_bot_name ?? ""))
      payload.github_bot_name = botName || null
    if (defaultBranch !== (settings?.github_default_base_branch ?? ""))
      payload.github_default_base_branch = defaultBranch || null

    if (Object.keys(payload).length === 0) {
      toast.error("No changes to save")
      return
    }

    updateMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("GitHub App configuration saved")
        setPrivateKey("")
        setWebhookSecret("")
        setFormDirty(false)
      },
      onError: () => toast.error("Failed to save GitHub App configuration"),
    })
  }

  if (statusLoading) {
    return <SectionSkeleton />
  }

  return (
    <section className="space-y-6">
      <StepHeader
        step={1}
        title="Configure GitHub App"
        description="Enter your GitHub App credentials. You'll need the App ID, private key, and webhook secret from your GitHub App settings."
      />

      <Alert className="max-w-xl">
        <AlertTitle>Don&apos;t have a GitHub App yet?</AlertTitle>
        <AlertDescription>
          <a
            href="https://github.com/settings/apps/new"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Create one on GitHub →
          </a>
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSave} className="max-w-xl space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="gh-app-id">App ID</Label>
          <Input
            id="gh-app-id"
            value={appId}
            onChange={(e) => {
              setAppId(e.target.value)
              markDirty()
            }}
            placeholder="123456"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="gh-private-key">Private Key (PEM)</Label>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1 size-3.5" />
              Upload .pem
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pem"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          <Textarea
            id="gh-private-key"
            value={privateKey}
            onChange={(e) => {
              setPrivateKey(e.target.value)
              markDirty()
            }}
            placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
            className="font-mono text-xs"
          />
          {settings?.github_private_key_masked && (
            <p className="font-mono text-xs text-muted-foreground">
              Current: {settings.github_private_key_masked}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gh-webhook-secret">Webhook Secret</Label>
          <Input
            id="gh-webhook-secret"
            type="password"
            value={webhookSecret}
            onChange={(e) => {
              setWebhookSecret(e.target.value)
              markDirty()
            }}
            placeholder={
              settings?.github_webhook_secret_masked
                ? "Leave empty to keep current"
                : "whsec_..."
            }
          />
          {settings?.github_webhook_secret_masked && (
            <p className="font-mono text-xs text-muted-foreground">
              Current: {settings.github_webhook_secret_masked}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <LabelWithTooltip
              htmlFor="gh-app-slug"
              label="App Slug"
              tooltip="The URL slug of your GitHub App (from its settings URL)."
            />
            <Input
              id="gh-app-slug"
              value={appSlug}
              onChange={(e) => {
                setAppSlug(e.target.value)
                markDirty()
              }}
              placeholder="codebox"
            />
          </div>
          <div className="space-y-1.5">
            <LabelWithTooltip
              htmlFor="gh-bot-name"
              label="Bot Name"
              tooltip="The name shown on comments posted by the app, e.g. codebox[bot]."
            />
            <Input
              id="gh-bot-name"
              value={botName}
              onChange={(e) => {
                setBotName(e.target.value)
                markDirty()
              }}
              placeholder="codebox[bot]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <LabelWithTooltip
            htmlFor="gh-default-branch"
            label="Default Base Branch"
            tooltip="The branch Codebox targets when creating PRs. Usually 'main' or 'master'."
          />
          <Input
            id="gh-default-branch"
            value={defaultBranch}
            onChange={(e) => {
              setDefaultBranch(e.target.value)
              markDirty()
            }}
            placeholder="main"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Configuration"}
          </Button>
          {formDirty && (
            <Badge variant="outline" className="text-xs text-amber-500">
              Unsaved changes
            </Badge>
          )}
        </div>
      </form>
    </section>
  )
}
