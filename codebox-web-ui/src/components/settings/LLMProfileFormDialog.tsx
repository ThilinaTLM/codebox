import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { LockIcon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { LLMProfile, Model } from "@/net/http/types"
import {
  useCreateLLMProfile,
  useModels,
  usePreviewModels,
  useUpdateLLMProfile,
} from "@/net/query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
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
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Spinner } from "@/components/ui/spinner"

const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1"

function getModelPlaceholder(provider: string) {
  switch (provider) {
    case "openrouter":
      return "e.g. anthropic/claude-sonnet-4"
    case "openai":
      return "e.g. gpt-4o"
    case "openai-compatible":
      return "e.g. your-model-id"
    case "opencode-go":
      return "e.g. kimi-k2.6"
    default:
      return "Model name"
  }
}

interface LLMProfileFormDialogProps {
  projectSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  profile?: LLMProfile
  nextProfileNumber?: number
}

export function LLMProfileFormDialog({
  projectSlug,
  open,
  onOpenChange,
  mode,
  profile,
  nextProfileNumber = 1,
}: LLMProfileFormDialogProps) {
  const slug = projectSlug
  const createMutation = useCreateLLMProfile(slug)
  const updateMutation = useUpdateLLMProfile(slug)
  const previewModelsMutation = usePreviewModels(slug)
  const isPending = createMutation.isPending || updateMutation.isPending

  const [name, setName] = useState("")
  const [provider, setProvider] = useState("openrouter")
  const [model, setModel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)

  // Models fetched via preview (create mode) or profile (edit mode)
  const [previewModels, setPreviewModels] = useState<Array<Model>>([])

  // Fetch models for edit mode using saved profile
  const { data: editModels = [] } = useModels(
    slug || undefined,
    mode === "edit" ? profile?.id : undefined,
    { enabled: mode === "edit" && !!profile?.id },
  )

  const availableModels = mode === "edit" ? editModels : previewModels

  // Debounced model preview fetch for create mode
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchPreviewModels = useCallback(
    (p: string, key: string, url: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)

      if (!key || key.length < 8) {
        setPreviewModels([])
        return
      }

      debounceRef.current = setTimeout(() => {
        const apiProvider = p === "openai-compatible" ? "openai" : p
        const previewBaseUrl =
          p === "opencode-go" ? OPENCODE_GO_BASE_URL : url || undefined
        previewModelsMutation.mutate(
          {
            provider: apiProvider,
            api_key: key,
            base_url: previewBaseUrl,
          },
          {
            onSuccess: (models) => setPreviewModels(models),
            onError: () => setPreviewModels([]),
          },
        )
      }, 600)
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: stable mutation ref
    [],
  )

  // Trigger model fetch when provider/apiKey/baseUrl change in create mode
  useEffect(() => {
    if (mode === "create" && apiKey.length >= 8) {
      fetchPreviewModels(provider, apiKey, baseUrl)
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [mode, provider, apiKey, baseUrl, fetchPreviewModels])

  // Sync form state when dialog opens or the target profile changes.
  // This runs on prop changes (open / profile.id), not on the Dialog's
  // internal onOpenChange callback, so it works regardless of *how* the
  // dialog becomes visible.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset only on open/profile change
  useEffect(() => {
    if (!open) return
    if (mode === "edit" && profile) {
      setName(profile.name)
      // `opencode-go` profiles always carry the Go base URL on the server,
      // but the UI hides the base-URL field for them; keep the provider as
      // stored so the openai-compatible shortcut doesn't swallow it.
      setProvider(
        profile.provider === "openai" && profile.base_url
          ? "openai-compatible"
          : profile.provider,
      )
      setModel(profile.model)
      setApiKey("")
      setBaseUrl(profile.base_url ?? "")
    } else {
      setName(`Profile ${nextProfileNumber}`)
      setProvider("openrouter")
      setModel("")
      setApiKey("")
      setBaseUrl("")
      setPreviewModels([])
    }
    setShowApiKey(false)
  }, [open, mode, profile?.id, nextProfileNumber])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Normalize provider for API (openai-compatible → openai)
    const apiProvider =
      provider === "openai-compatible" ? "openai" : provider

    // `opencode-go` profiles pin the Go base URL server-side so exports
    // stay self-contained and the agent always has it available.
    const submitBaseUrl =
      provider === "opencode-go" ? OPENCODE_GO_BASE_URL : baseUrl || null

    if (mode === "create") {
      createMutation.mutate(
        {
          name,
          provider: apiProvider,
          model,
          api_key: apiKey,
          base_url: submitBaseUrl,
        },
        {
          onSuccess: () => {
            toast.success(`Profile "${name}" created`)
            onOpenChange(false)
          },
          onError: () => toast.error("Failed to create profile"),
        },
      )
    } else if (profile) {
      const payload: Record<string, string | null> = {}
      if (name !== profile.name) payload.name = name
      if (apiProvider !== profile.provider) payload.provider = apiProvider
      if (model !== profile.model) payload.model = model
      if (apiKey) payload.api_key = apiKey
      const newBaseUrl = submitBaseUrl
      if (newBaseUrl !== profile.base_url) payload.base_url = newBaseUrl

      updateMutation.mutate(
        { id: profile.id, payload },
        {
          onSuccess: () => {
            toast.success(`Profile "${name}" updated`)
            onOpenChange(false)
          },
          onError: () => toast.error("Failed to update profile"),
        },
      )
    }
  }

  const showBaseUrl = provider === "openai" || provider === "openai-compatible"
  const baseUrlRequired = provider === "openai-compatible"
  const isCreateValid =
    name && provider && model && apiKey && (!baseUrlRequired || baseUrl)
  const isEditValid =
    name && provider && model && (!baseUrlRequired || baseUrl)

  const isLoadingModels = previewModelsMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My OpenRouter"
            />
          </div>

          {/* Provider */}
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
                <SelectItem value="opencode-go">OpenCode Go</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* API Key with eye toggle */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-api-key">API Key</Label>
            {mode === "edit" && profile && !apiKey && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <HugeiconsIcon
                  icon={LockIcon}
                  size={14}
                  strokeWidth={2}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {profile.api_key_masked}
                </span>
              </div>
            )}
            <InputGroup>
              <InputGroupInput
                id="profile-api-key"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  mode === "edit"
                    ? "Enter a new key to replace it"
                    : "sk-..."
                }
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  onClick={() => setShowApiKey((v) => !v)}
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  <HugeiconsIcon
                    icon={showApiKey ? ViewOffSlashIcon : ViewIcon}
                    size={14}
                    strokeWidth={2}
                  />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {mode === "edit" && profile && !apiKey && (
              <p className="text-xs text-muted-foreground">
                The stored key cannot be displayed. Enter a new key only if you
                want to replace it.
              </p>
            )}
          </div>

          {/* Base URL — conditional */}
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

          {/* Model — Combobox when models available, Input fallback */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="profile-model">Model</Label>
              {isLoadingModels && <Spinner className="size-3.5" />}
            </div>
            {availableModels.length > 0 ? (
              <ModelCombobox
                models={availableModels}
                value={model}
                onValueChange={(v) => setModel(v ?? "")}
                placeholder={getModelPlaceholder(provider)}
              />
            ) : (
              <Input
                id="profile-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={getModelPlaceholder(provider)}
              />
            )}
            {mode === "create" && !apiKey && (
              <p className="text-xs text-muted-foreground">
                Enter your API key above to load available models.
              </p>
            )}
          </div>

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

function ModelCombobox({
  models,
  value,
  onValueChange,
  placeholder,
}: {
  models: Array<Model>
  value: string
  onValueChange: (value: string | null) => void
  placeholder: string
}) {
  const modelIds = useMemo(() => models.map((m) => m.id), [models])
  const modelNameById = useMemo(
    () => new Map(models.map((m) => [m.id, m.name || m.id])),
    [models],
  )

  const filter = useCallback(
    (itemId: string, query: string) => {
      const q = query.toLowerCase()
      if (itemId.toLowerCase().includes(q)) return true
      const name = modelNameById.get(itemId)
      return name ? name.toLowerCase().includes(q) : false
    },
    [modelNameById],
  )

  return (
    <Combobox
      value={value}
      onValueChange={onValueChange}
      items={modelIds}
      filter={filter}
    >
      <ComboboxInput placeholder={placeholder} showClear={!!value} />
      <ComboboxContent>
        <ComboboxList>
          {(itemId: string) => (
            <ComboboxItem key={itemId} value={itemId}>
              {modelNameById.get(itemId) ?? itemId}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>No models found</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  )
}
