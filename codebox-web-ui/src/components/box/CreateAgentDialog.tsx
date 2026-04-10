import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import type { GitHubRepo, Model } from "@/net/http/types"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  useCreateBox,
  useGitHubRepos,
  useGitHubStatus,
  useModels,
} from "@/net/query"
import { generateReadableName } from "@/lib/name-generator"

const PROVIDERS = [
  { id: "openrouter", name: "OpenRouter" },
  { id: "openai", name: "OpenAI" },
] as const

interface CreateAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateAgentDialog({
  open,
  onOpenChange,
}: CreateAgentDialogProps) {
  const navigate = useNavigate()
  const createMutation = useCreateBox()

  const [name, setName] = useState("")
  const [selectedProvider, setSelectedProvider] = useState<string>("openrouter")
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [initialPrompt, setInitialPrompt] = useState("")

  const { data: models } = useModels(selectedProvider)
  const { data: githubStatus } = useGitHubStatus()
  const { data: repos } = useGitHubRepos()

  const githubEnabled = githubStatus?.enabled ?? false

  // Generate a preview name that stays stable until the dialog is re-opened
  const previewName = useMemo(() => generateReadableName(), [open])

  useEffect(() => {
    setSelectedModel(null)
  }, [selectedProvider])

  const handleCreate = () => {
    createMutation.mutate(
      {
        name: name.trim() || undefined,
        provider: selectedProvider,
        model: selectedModel?.id || undefined,
        initial_prompt: initialPrompt.trim() || undefined,
        github_repo: selectedRepo?.full_name || undefined,
      },
      {
        onSuccess: (box) => {
          toast.success("Agent created")
          onOpenChange(false)
          setName("")
          setSelectedProvider("openrouter")
          setSelectedModel(null)
          setSelectedRepo(null)
          setInitialPrompt("")
          navigate({ to: "/boxes/$boxId", params: { boxId: box.id } })
        },
        onError: () => toast.error("Failed to create agent"),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Create Agent
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label
              htmlFor="agent-name"
              className="font-terminal text-xs tracking-wider text-ghost uppercase"
            >
              Name
            </Label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={previewName}
              className="h-9 w-full rounded-lg border border-border bg-inset px-3 py-1 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="font-terminal text-xs tracking-wider text-ghost uppercase">
              Provider
            </Label>
            <Combobox
              value={selectedProvider}
              onValueChange={(value) =>
                setSelectedProvider(value ?? "openrouter")
              }
              items={PROVIDERS.map((provider) => provider.id)}
              itemToStringLabel={(provider) =>
                PROVIDERS.find((item) => item.id === provider)?.name ?? provider
              }
            >
              <ComboboxInput placeholder="Select provider" className="w-full" />
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxCollection>
                    {(provider: string) => {
                      const option = PROVIDERS.find(
                        (item) => item.id === provider
                      )
                      return (
                        <ComboboxItem key={provider} value={provider}>
                          {option?.name ?? provider}
                        </ComboboxItem>
                      )
                    }}
                  </ComboboxCollection>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {/* Model */}
          <div className="grid gap-1.5">
            <Label className="font-terminal text-xs tracking-wider text-ghost uppercase">
              Model
            </Label>
            <Combobox
              value={selectedModel}
              onValueChange={setSelectedModel}
              items={models ?? []}
              itemToStringLabel={(m: Model) => `${m.name} ${m.id}`}
              isItemEqualToValue={(a: Model, b: Model) => a.id === b.id}
            >
              <ComboboxInput
                placeholder="Default model"
                className="w-full"
                showClear={!!selectedModel}
              />
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxCollection>
                    {(m: Model) => (
                      <ComboboxItem key={m.id} value={m}>
                        <div className="grid">
                          <span className="truncate text-sm">{m.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {m.id}
                          </span>
                        </div>
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxList>
                <ComboboxEmpty>
                  No models found for {selectedProvider}
                </ComboboxEmpty>
              </ComboboxContent>
            </Combobox>
          </div>

          {/* GitHub Repo */}
          {githubEnabled && (
            <div className="grid gap-1.5">
              <Label className="font-terminal text-xs tracking-wider text-ghost uppercase">
                GitHub Repo
              </Label>
              <Combobox
                value={selectedRepo}
                onValueChange={setSelectedRepo}
                items={repos ?? []}
                itemToStringLabel={(r: GitHubRepo) => r.full_name}
                isItemEqualToValue={(a: GitHubRepo, b: GitHubRepo) =>
                  a.full_name === b.full_name
                }
              >
                <ComboboxInput
                  placeholder="None (no repo cloned)"
                  className="w-full"
                  showClear={!!selectedRepo}
                />
                <ComboboxContent>
                  <ComboboxList>
                    <ComboboxCollection>
                      {(r: GitHubRepo) => (
                        <ComboboxItem key={r.full_name} value={r}>
                          <span className="truncate text-sm">
                            {r.full_name}
                          </span>
                          {r.private && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              private
                            </span>
                          )}
                        </ComboboxItem>
                      )}
                    </ComboboxCollection>
                  </ComboboxList>
                  <ComboboxEmpty>No repos found</ComboboxEmpty>
                </ComboboxContent>
              </Combobox>
            </div>
          )}

          {/* Initial prompt */}
          <div className="grid gap-1.5">
            <Label
              htmlFor="agent-prompt"
              className="font-terminal text-xs tracking-wider text-ghost uppercase"
            >
              Initial Prompt
            </Label>
            <textarea
              id="agent-prompt"
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="What should the agent work on?"
              rows={4}
              className="font-terminal w-full resize-none rounded-lg border border-border bg-inset px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="bg-primary text-primary-foreground"
          >
            Create Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
