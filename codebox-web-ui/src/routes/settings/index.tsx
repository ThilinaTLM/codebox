import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type {
  GitHubInstallation,
  GitHubRepo,
  LLMProfile,
} from "@/net/http/types"
import {
  useAddGitHubInstallation,
  useChangePassword,
  useCreateLLMProfile,
  useDeleteLLMProfile,
  useGitHubInstallations,
  useGitHubStatus,
  useLLMProfiles,
  useRemoveGitHubInstallation,
  useSyncGitHubInstallation,
  useUpdateLLMProfile,
  useUpdateUserSettings,
  useUserSettings,
} from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { API_URL } from "@/lib/constants"
import { cn } from "@/lib/utils"

// ── Route ───────────────────────────────────────────────────

const VALID_SECTIONS = [
  "account",
  "llm-profiles",
  "integrations",
  "github",
] as const
type SettingsSection = (typeof VALID_SECTIONS)[number]

const SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "account", label: "Account" },
  { id: "llm-profiles", label: "LLM Profiles" },
  { id: "integrations", label: "Integrations" },
  { id: "github", label: "GitHub" },
]

export const Route = createFileRoute("/settings/")({
  validateSearch: (
    search: Record<string, unknown>
  ): { tab: SettingsSection } => {
    const tab = VALID_SECTIONS.includes(search.tab as SettingsSection)
      ? (search.tab as SettingsSection)
      : "account"
    return { tab }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate()

  const setSection = (id: SettingsSection) => {
    navigate({
      to: "/settings",
      search: { tab: id },
      replace: true,
    })
  }

  const renderSection = () => {
    switch (tab) {
      case "account":
        return <AccountSection />
      case "llm-profiles":
        return <LLMProfilesSection />
      case "integrations":
        return <IntegrationsSection />
      case "github":
        return <GitHubSection />
    }
  }

  return (
    <div className="flex h-[calc(100svh-24px)]">
      {/* Left nav */}
      <nav className="w-48 shrink-0 space-y-1 overflow-y-auto border-r border-border p-4">
        <h1 className="mb-4 px-3 font-display text-lg font-semibold tracking-tight">
          Settings
        </h1>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
              tab === s.id
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Right content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">{renderSection()}</div>
      </main>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Account Section
// ═══════════════════════════════════════════════════════════════

function AccountSection() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg">Profile</h2>
        <div className="mt-4 grid max-w-md gap-3">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">Username</span>
            <span className="text-sm">{user?.username}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant="outline" className="text-xs">
              {user?.user_type}
            </Badge>
          </div>
        </div>
      </section>

      <ChangePasswordSection />

      {/* Theme */}
      <section>
        <h2 className="font-display text-lg">Theme</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Toggle between light and dark mode.
        </p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="font-display text-lg text-destructive">Danger Zone</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Sign out of your current session.
        </p>
        <Button variant="destructive" className="mt-4" onClick={logout}>
          Sign out
        </Button>
      </section>
    </div>
  )
}

function ChangePasswordSection() {
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const changePasswordMutation = useChangePassword()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match")
      return
    }
    if (newPassword.length < 4) {
      toast.error("Password must be at least 4 characters")
      return
    }
    changePasswordMutation.mutate(
      { oldPassword, newPassword },
      {
        onSuccess: () => {
          toast.success("Password changed successfully")
          setOldPassword("")
          setNewPassword("")
          setConfirmPassword("")
        },
        onError: () =>
          toast.error(
            "Failed to change password. Check your current password."
          ),
      }
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg">Change Password</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Update your account password.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 max-w-md space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="old-password">Current password</Label>
          <Input
            id="old-password"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={
            changePasswordMutation.isPending ||
            !oldPassword ||
            !newPassword ||
            !confirmPassword
          }
        >
          {changePasswordMutation.isPending ? "Changing..." : "Change password"}
        </Button>
      </form>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════
// LLM Profiles Section
// ═══════════════════════════════════════════════════════════════

function LLMProfilesSection() {
  const { data: profiles = [], isLoading } = useLLMProfiles()
  const { data: settings } = useUserSettings()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<LLMProfile | null>(null)

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg">LLM Profiles</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Manage your LLM provider configurations. Each profile stores a
            provider, model, and API key.
          </p>
        </div>
        {profiles.length > 0 && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Create Profile
          </Button>
        )}
      </div>

      {profiles.length === 0 ? (
        <LLMProfilesEmptyState onCreateClick={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {profiles.map((profile) => (
            <LLMProfileCard
              key={profile.id}
              profile={profile}
              isDefault={settings?.default_llm_profile_id === profile.id}
              onEdit={() => setEditingProfile(profile)}
            />
          ))}
        </div>
      )}

      <LLMProfileFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
      />

      <LLMProfileFormDialog
        open={editingProfile !== null}
        onOpenChange={(open) => {
          if (!open) setEditingProfile(null)
        }}
        mode="edit"
        profile={editingProfile ?? undefined}
      />
    </div>
  )
}

function LLMProfilesEmptyState({
  onCreateClick,
}: {
  onCreateClick: () => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-12 text-center">
      <h3 className="font-display text-base">
        No LLM profiles configured yet
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Create one to start using Codebox. You&apos;ll need a provider API key
        from OpenRouter, OpenAI, or a compatible service.
      </p>
      <Button className="mt-6" onClick={onCreateClick}>
        Create Your First Profile
      </Button>
    </div>
  )
}

function LLMProfileCard({
  profile,
  isDefault,
  onEdit,
}: {
  profile: LLMProfile
  isDefault: boolean
  onEdit: () => void
}) {
  const deleteMutation = useDeleteLLMProfile()
  const updateSettingsMutation = useUpdateUserSettings()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSetDefault = () => {
    updateSettingsMutation.mutate(
      { default_llm_profile_id: profile.id },
      {
        onSuccess: () => toast.success(`"${profile.name}" set as default`),
        onError: () => toast.error("Failed to set default profile"),
      }
    )
  }

  const handleDelete = () => {
    deleteMutation.mutate(profile.id, {
      onSuccess: () => {
        toast.success(`Profile "${profile.name}" deleted`)
        setConfirmDelete(false)
      },
      onError: () => toast.error("Failed to delete profile"),
    })
  }

  return (
    <>
      <Card className="rounded-lg border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display truncate">{profile.name}</span>
                {isDefault && (
                  <Badge variant="default" className="shrink-0 text-xs">
                    Default
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {profile.provider} &middot; {profile.model}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {profile.api_key_masked}
              </p>
              {profile.base_url && (
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {profile.base_url}
                </p>
              )}
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="xs" onClick={onEdit}>
              Edit
            </Button>
            {!isDefault && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleSetDefault}
                disabled={updateSettingsMutation.isPending}
              >
                Set as Default
              </Button>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{profile.name}&rdquo;?
              {isDefault &&
                " This is your default profile — the default will be cleared."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LLMProfileFormDialog({
  open,
  onOpenChange,
  mode,
  profile,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  profile?: LLMProfile
}) {
  const createMutation = useCreateLLMProfile()
  const updateMutation = useUpdateLLMProfile()
  const isPending = createMutation.isPending || updateMutation.isPending

  const [name, setName] = useState("")
  const [provider, setProvider] = useState("openrouter")
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")

  // Reset form when dialog opens/closes or profile changes
  const resetForm = () => {
    if (mode === "edit" && profile) {
      setName(profile.name)
      setProvider(profile.provider)
      setModel(profile.model)
      setApiKey("")
      setBaseUrl(profile.base_url ?? "")
    } else {
      setName("")
      setProvider("openrouter")
      setModel("")
      setApiKey("")
      setBaseUrl("")
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when dialog opens or profile changes
  const handleOpenChange = (next: boolean) => {
    if (next) resetForm()
    onOpenChange(next)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === "create") {
      createMutation.mutate(
        {
          name,
          provider,
          model,
          api_key: apiKey,
          base_url: baseUrl || null,
        },
        {
          onSuccess: () => {
            toast.success(`Profile "${name}" created`)
            onOpenChange(false)
          },
          onError: () => toast.error("Failed to create profile"),
        }
      )
    } else if (profile) {
      const payload: Record<string, string | null> = {}
      if (name !== profile.name) payload.name = name
      if (provider !== profile.provider) payload.provider = provider
      if (model !== profile.model) payload.model = model
      if (apiKey) payload.api_key = apiKey
      const newBaseUrl = baseUrl || null
      if (newBaseUrl !== profile.base_url) payload.base_url = newBaseUrl

      updateMutation.mutate(
        { id: profile.id, payload },
        {
          onSuccess: () => {
            toast.success(`Profile "${name}" updated`)
            onOpenChange(false)
          },
          onError: () => toast.error("Failed to update profile"),
        }
      )
    }
  }

  const isCreateValid = name && provider && model && apiKey
  const isEditValid = name && provider && model

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create LLM Profile" : "Edit LLM Profile"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Configure a new LLM provider with your API key."
              : "Update your LLM profile configuration."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My OpenRouter"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => v && setProvider(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-model">Model</Label>
            <Input
              id="profile-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. anthropic/claude-sonnet-4"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-api-key">API Key</Label>
            <Input
              id="profile-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                mode === "edit"
                  ? "Leave empty to keep current key"
                  : "sk-..."
              }
            />
            {mode === "edit" && profile && (
              <p className="font-mono text-xs text-muted-foreground">
                Current: {profile.api_key_masked}
              </p>
            )}
          </div>
          {provider === "openai" && (
            <div className="space-y-1.5">
              <Label htmlFor="profile-base-url">Base URL</Label>
              <Input
                id="profile-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-muted-foreground">
                Optional. Override for OpenAI-compatible APIs.
              </p>
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              disabled={
                isPending ||
                (mode === "create" ? !isCreateValid : !isEditValid)
              }
            >
              {isPending
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                  ? "Create Profile"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════
// Integrations Section
// ═══════════════════════════════════════════════════════════════

function IntegrationsSection() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-lg">API Keys</h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Manage API keys for external services used by your boxes.
        </p>
      </div>
      <TavilyKeySection />
    </div>
  )
}

function TavilyKeySection() {
  const { data: settings } = useUserSettings()
  const updateMutation = useUpdateUserSettings()
  const [tavilyKey, setTavilyKey] = useState("")

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tavilyKey) return
    updateMutation.mutate(
      { tavily_api_key: tavilyKey },
      {
        onSuccess: () => {
          toast.success("Tavily API key saved")
          setTavilyKey("")
        },
        onError: () => toast.error("Failed to save Tavily API key"),
      }
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg">Tavily</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Used for the web search tool.
      </p>
      <form onSubmit={handleSave} className="mt-4 max-w-md space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="tavily-key">API Key</Label>
          {settings?.tavily_api_key_masked ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
              <span className="font-mono text-sm text-muted-foreground">
                {settings.tavily_api_key_masked}
              </span>
              <Badge variant="outline" className="ml-auto text-xs">
                Configured
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5">
              <span className="text-sm text-muted-foreground">
                Not configured
              </span>
            </div>
          )}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="tavily-key-input">
              {settings?.tavily_api_key_masked
                ? "Replace key"
                : "Enter API key"}
            </Label>
            <Input
              id="tavily-key-input"
              type="password"
              value={tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              placeholder="tvly-..."
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={updateMutation.isPending || !tavilyKey}
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Get a key at{" "}
          <a
            href="https://tavily.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            tavily.com
          </a>
        </p>
      </form>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════
// GitHub Section
// ═══════════════════════════════════════════════════════════════

function GitHubSection() {
  const { data: status, isLoading: statusLoading } = useGitHubStatus()
  const { data: installations, isLoading: installationsLoading } =
    useGitHubInstallations()

  return (
    <div className="space-y-10">
      <GitHubAppConfigSection
        status={status ?? null}
        statusLoading={statusLoading}
      />
      {status?.enabled && (
        <>
          <Separator />
          <ConnectSection appSlug={status.app_slug} />
          <ManualInstallSection />
          <InstallationsList
            installations={installations ?? []}
            isLoading={installationsLoading}
          />
        </>
      )}
    </div>
  )
}

function GitHubAppConfigSection({
  status,
  statusLoading,
}: {
  status: {
    enabled: boolean
    app_slug: string | null
    webhook_url: string | null
  } | null
  statusLoading: boolean
}) {
  const { data: settings } = useUserSettings()
  const updateMutation = useUpdateUserSettings()

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
    return (
      <section>
        <h2 className="font-display text-lg">GitHub App Configuration</h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </section>
    )
  }

  const webhookUrl =
    status?.webhook_url && status.enabled
      ? `${API_URL}${status.webhook_url}`
      : null

  return (
    <section>
      <h2 className="font-display text-lg">GitHub App Configuration</h2>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">
        Connect a GitHub App to enable issue and PR triggers. You&apos;ll need
        the App ID, private key, and webhook secret from your GitHub App
        settings.
      </p>

      {webhookUrl && (
        <div className="mt-4 max-w-xl rounded-lg border border-border bg-card px-4 py-3">
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
      )}

      <form onSubmit={handleSave} className="mt-6 max-w-xl space-y-4">
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
          <Label htmlFor="gh-private-key">Private Key (PEM)</Label>
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
            <Label htmlFor="gh-app-slug">App Slug</Label>
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
            <Label htmlFor="gh-bot-name">Bot Name</Label>
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
          <Label htmlFor="gh-default-branch">Default Base Branch</Label>
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

        <Button type="submit" size="sm" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Saving..." : "Save Configuration"}
        </Button>
      </form>
    </section>
  )
}

function ConnectSection({ appSlug }: { appSlug: string | null }) {
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`
  return (
    <section>
      <h2 className="font-display text-lg">Connect GitHub</h2>
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
      <h2 className="font-display text-lg">Manual Setup</h2>
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
        <h2 className="font-display text-lg">Connected Installations</h2>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg">Connected Installations</h2>
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
  )
}
