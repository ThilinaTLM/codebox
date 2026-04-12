import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useTheme } from "next-themes"
import { ChevronRight, HelpCircle, Monitor, Upload } from "lucide-react"
import {
  AiBrain01Icon,
  CheckmarkCircle02Icon,
  Github01Icon,
  InternetIcon,
  Moon02Icon,
  MoreHorizontalCircle01Icon,
  MultiplicationSignCircleIcon,
  PaintBoardIcon,
  Sun03Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
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
  useModels,
  useRemoveGitHubInstallation,
  useSyncGitHubInstallation,
  useUpdateLLMProfile,
  useUpdateUserSettings,
  useUserSettings,
} from "@/net/query"
import { useAuthStore } from "@/lib/auth"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { API_URL } from "@/lib/constants"
import { cn } from "@/lib/utils"

// ── Route ───────────────────────────────────────────────────

const VALID_SECTIONS = [
  "account",
  "appearance",
  "llm-profiles",
  "github",
  "tavily",
] as const
type SettingsSection = (typeof VALID_SECTIONS)[number]

const SECTIONS: Array<{
  id: SettingsSection
  label: string
  icon: IconSvgElement
}> = [
  { id: "account", label: "Account", icon: UserCircleIcon },
  { id: "appearance", label: "Appearance", icon: PaintBoardIcon },
  { id: "llm-profiles", label: "LLM Profiles", icon: AiBrain01Icon },
  { id: "github", label: "GitHub", icon: Github01Icon },
  { id: "tavily", label: "Tavily", icon: InternetIcon },
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

// ── Shared helpers ──────────────────────────────────────────

function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="mt-4 h-32 w-full max-w-md rounded-lg" />
    </div>
  )
}

function LabelWithTooltip({
  htmlFor,
  label,
  tooltip,
}: {
  htmlFor: string
  label: string
  tooltip: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <Tooltip>
        <TooltipTrigger
          className="text-muted-foreground transition-colors hover:text-foreground"
          type="button"
          tabIndex={-1}
        >
          <HelpCircle className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

// ── Main Layout ─────────────────────────────────────────────

function SettingsPage() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

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
      case "appearance":
        return <AppearanceSection />
      case "llm-profiles":
        return <LLMProfilesSection />
      case "github":
        return <GitHubSection />
      case "tavily":
        return <TavilySection />
    }
  }

  if (isMobile) {
    return (
      <div className="flex h-[calc(100svh-24px)] flex-col">
        {/* Top tab bar on mobile */}
        <div className="shrink-0 border-b border-border">
          <div className="flex gap-1 overflow-x-auto px-4 py-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  tab === s.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <HugeiconsIcon
                  icon={s.icon}
                  size={14}
                  strokeWidth={2}
                  className={cn(
                    "shrink-0",
                    tab === s.id && "text-primary"
                  )}
                />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-3xl">{renderSection()}</div>
        </main>
      </div>
    )
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
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              tab === s.id
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            )}
          >
            <HugeiconsIcon
              icon={s.icon}
              size={16}
              strokeWidth={2}
              className={cn(
                "shrink-0",
                tab === s.id && "text-primary"
              )}
            />
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

  const userInitial = user?.username
    ? user.username.charAt(0).toUpperCase()
    : "?"

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg">Profile</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Your account information.
        </p>

        {/* User avatar + name */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
            {userInitial}
          </div>
          <div>
            <p className="font-display text-base font-medium">
              {user?.username}
            </p>
            <p className="text-sm text-muted-foreground">
              {user?.user_type === "admin" ? "Administrator" : "User"}
            </p>
          </div>
        </div>

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

      {/* Session */}
      <section>
        <h2 className="font-display text-lg">Session</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Manage your current session.
        </p>
        <Button variant="outline" className="mt-4" onClick={logout}>
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

  const passwordsMatch = newPassword === confirmPassword
  const passwordLongEnough = newPassword.length >= 4

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordsMatch) return
    if (!passwordLongEnough) {
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
          <p className="text-xs text-muted-foreground">
            Minimum 4 characters
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {confirmPassword.length > 0 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <HugeiconsIcon
                  icon={
                    passwordsMatch
                      ? CheckmarkCircle02Icon
                      : MultiplicationSignCircleIcon
                  }
                  size={16}
                  strokeWidth={2}
                  className={
                    passwordsMatch ? "text-green-500" : "text-destructive"
                  }
                />
              </span>
            )}
          </div>
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={
            changePasswordMutation.isPending ||
            !oldPassword ||
            !newPassword ||
            !confirmPassword ||
            !passwordsMatch
          }
        >
          {changePasswordMutation.isPending ? "Changing..." : "Change password"}
        </Button>
      </form>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════
// Appearance Section
// ═══════════════════════════════════════════════════════════════

const THEME_OPTIONS = [
  { id: "light", label: "Light", icon: Sun03Icon, isHugeicon: true },
  { id: "dark", label: "Dark", icon: Moon02Icon, isHugeicon: true },
  { id: "system", label: "System", icon: Monitor, isHugeicon: false },
] as const

function AppearanceSection() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg">Theme</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Choose how Codebox looks to you. Select a single theme or sync with
          your system settings.
        </p>
        <div className="mt-4 grid max-w-md grid-cols-3 gap-3">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                theme === t.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-foreground/20"
              )}
            >
              {t.isHugeicon ? (
                <HugeiconsIcon
                  icon={t.icon as IconSvgElement}
                  size={24}
                  strokeWidth={1.5}
                />
              ) : (
                <Monitor size={24} strokeWidth={1.5} />
              )}
              <span className="text-sm font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
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
    return <SectionSkeleton />
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
        LLM profiles tell Codebox which AI model to use when working on your
        issues. You can create multiple profiles for different providers and
        switch between them.
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        You&apos;ll need an API key from OpenRouter, OpenAI, or a compatible
        service.
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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-xs" />}
                className="ml-auto"
              >
                <HugeiconsIcon
                  icon={MoreHorizontalCircle01Icon}
                  size={16}
                  strokeWidth={2}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!isDefault && (
                  <DropdownMenuItem
                    onClick={handleSetDefault}
                    disabled={updateSettingsMutation.isPending}
                  >
                    Set as Default
                  </DropdownMenuItem>
                )}
                {!isDefault && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

function getModelPlaceholder(provider: string) {
  switch (provider) {
    case "openrouter":
      return "e.g. anthropic/claude-sonnet-4"
    case "openai":
      return "e.g. gpt-4o"
    case "openai-compatible":
      return "e.g. your-model-id"
    default:
      return "Model name"
  }
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

  // Fetch models for combobox in edit mode
  const { data: availableModels = [] } = useModels(
    mode === "edit" ? profile?.id : undefined,
    { enabled: mode === "edit" && !!profile?.id }
  )

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

    // Normalize provider for API (openai-compatible → openai)
    const apiProvider =
      provider === "openai-compatible" ? "openai" : provider

    if (mode === "create") {
      createMutation.mutate(
        {
          name,
          provider: apiProvider,
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
      if (apiProvider !== profile.provider) payload.provider = apiProvider
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

  const showBaseUrl = provider === "openai" || provider === "openai-compatible"
  const baseUrlRequired = provider === "openai-compatible"
  const isCreateValid =
    name &&
    provider &&
    model &&
    apiKey &&
    (!baseUrlRequired || baseUrl)
  const isEditValid =
    name && provider && model && (!baseUrlRequired || baseUrl)

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
                <SelectItem value="openai-compatible">
                  OpenAI Compatible
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-model">Model</Label>
            {mode === "edit" && availableModels.length > 0 ? (
              <Combobox value={model} onValueChange={(v) => setModel(v ?? "")}>
                <ComboboxInput
                  placeholder={getModelPlaceholder(provider)}
                  showClear={!!model}
                />
                <ComboboxContent>
                  <ComboboxList>
                    {availableModels.map((m) => (
                      <ComboboxItem key={m.id} value={m.id}>
                        {m.name || m.id}
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                  <ComboboxEmpty>No models found</ComboboxEmpty>
                </ComboboxContent>
              </Combobox>
            ) : (
              <Input
                id="profile-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={getModelPlaceholder(provider)}
              />
            )}
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
          {showBaseUrl && (
            <div className="space-y-1.5">
              <Label htmlFor="profile-base-url">
                Base URL{baseUrlRequired && " *"}
              </Label>
              <Input
                id="profile-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-muted-foreground">
                {baseUrlRequired
                  ? "Required. The base URL for your OpenAI-compatible API."
                  : "Optional. Override for OpenAI-compatible APIs."}
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
// Tavily Section
// ═══════════════════════════════════════════════════════════════

function TavilySection() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg">Tavily</h2>
          <Badge variant="outline" className="text-xs">
            Optional
          </Badge>
        </div>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Tavily enables web search during agent runs, letting the agent look up
          documentation, APIs, and other resources while working on your issues.
        </p>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Codebox works without it, but the web search tool won&apos;t be
          available.
        </p>
      </div>
      <TavilyKeyForm />
    </div>
  )
}

function TavilyKeyForm() {
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

  const handleRemove = () => {
    updateMutation.mutate(
      { tavily_api_key: "" },
      {
        onSuccess: () => toast.success("Tavily API key removed"),
        onError: () => toast.error("Failed to remove Tavily API key"),
      }
    )
  }

  return (
    <section>
      <form onSubmit={handleSave} className="max-w-md space-y-3">
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
        <div className="flex items-center justify-between">
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
          {settings?.tavily_api_key_masked && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-destructive hover:text-destructive"
              onClick={handleRemove}
              disabled={updateMutation.isPending}
            >
              Remove key
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════
// GitHub Section
// ═══════════════════════════════════════════════════════════════

function StepHeader({
  step,
  title,
  description,
}: {
  step: number
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
        {step}
      </span>
      <div>
        <h2 className="font-display text-lg">{title}</h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

function GitHubSection() {
  const { data: status, isLoading: statusLoading } = useGitHubStatus()
  const { data: installations, isLoading: installationsLoading } =
    useGitHubInstallations()

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-lg">GitHub</h2>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Connect a GitHub App to enable issue and PR triggers for your agent.
        </p>
      </div>

      <GitHubAppConfigSection
        status={status ?? null}
        statusLoading={statusLoading}
      />
      {status?.enabled && (
        <>
          <Separator />
          <GitHubInstallSection appSlug={status.app_slug} />
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
  statusLoading,
}: {
  status?: {
    enabled: boolean
    app_slug: string | null
    webhook_url: string | null
  } | null
  statusLoading: boolean
}) {
  const { data: settings } = useUserSettings()
  const updateMutation = useUpdateUserSettings()
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
    // Reset input so the same file can be re-selected
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

function GitHubInstallSection({ appSlug }: { appSlug: string | null }) {
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

      <Button
        nativeButton={false}
        render={
          <a href={installUrl} target="_blank" rel="noopener noreferrer" />
        }
      >
        Install GitHub App
      </Button>

      <ManualInstallSection />
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

function InstallationsList({
  installations,
  isLoading,
}: {
  installations: Array<GitHubInstallation>
  isLoading: boolean
}) {
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
  const syncMutation = useSyncGitHubInstallation()
  const removeMutation = useRemoveGitHubInstallation()
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
