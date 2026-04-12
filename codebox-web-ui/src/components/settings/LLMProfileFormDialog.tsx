import { useState } from "react"
import { toast } from "sonner"
import type { LLMProfile } from "@/net/http/types"
import { useCreateLLMProfile, useModels, useUpdateLLMProfile } from "@/net/query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

interface LLMProfileFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  profile?: LLMProfile
}

export function LLMProfileFormDialog({
  open,
  onOpenChange,
  mode,
  profile,
}: LLMProfileFormDialogProps) {
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
