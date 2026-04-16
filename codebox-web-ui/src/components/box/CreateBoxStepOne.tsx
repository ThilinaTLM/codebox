import { useEffect, useRef } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, ChevronRight } from "lucide-react"
import type { GitHubRepo, LLMProfile } from "@/net/http/types"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

const INPUT_CLS =
  "h-9 w-full rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground transition-colors duration-fast outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" as const
const TEXTAREA_CLS =
  "w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors duration-fast outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" as const

function autoName(task: string): string {
  return task
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 40)
}

interface CreateBoxStepOneProps {
  projectSlug: string
  name: string
  onNameChange: (v: string) => void
  autoStartPrompt: string
  onAutoStartPromptChange: (v: string) => void
  selectedProfile: LLMProfile | null
  onSelectedProfileChange: (v: LLMProfile | null) => void
  profiles: Array<LLMProfile> | undefined
  selectedRepo: GitHubRepo | null
  onSelectedRepoChange: (v: GitHubRepo | null) => void
  repos: Array<GitHubRepo> | undefined
  githubEnabled: boolean
  isPending: boolean
  onConfigure: () => void
  onCreate: () => void
}

export function CreateBoxStepOne({
  projectSlug,
  name,
  onNameChange,
  autoStartPrompt,
  onAutoStartPromptChange,
  selectedProfile,
  onSelectedProfileChange,
  profiles,
  selectedRepo,
  onSelectedRepoChange,
  repos,
  githubEnabled,
  isPending,
  onConfigure,
  onCreate,
}: CreateBoxStepOneProps) {
  const taskRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    taskRef.current?.focus()
  }, [])

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={
              <Link
                to="/projects/$projectSlug"
                params={{ projectSlug }}
              />
            }
          >
            <ArrowLeft size={16} />
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Create Agent
          </h1>
        </div>
        <span className="text-xs text-muted-foreground">Step 1 of 2</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-16 pt-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Task — primary field */}
          <div className="grid gap-1.5">
            <Label htmlFor="task" className="text-label">
              What should the agent do?
            </Label>
            <textarea
              ref={taskRef}
              id="task"
              value={autoStartPrompt}
              onChange={(e) => onAutoStartPromptChange(e.target.value)}
              placeholder="e.g., Fix the authentication bug in login.ts"
              rows={5}
              className={TEXTAREA_CLS}
            />
          </div>

          {/* Name — optional */}
          <div className="grid gap-1.5">
            <Label htmlFor="agent-name" className="text-label">
              Name (optional)
            </Label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={autoName(autoStartPrompt) || "auto-generated"}
              className={INPUT_CLS}
            />
          </div>

          {/* LLM Profile */}
          <div className="grid gap-1.5">
            <Label className="text-label">LLM Profile</Label>
            {profiles && profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No LLM profiles configured.{" "}
                <Link
                  to="/projects/$projectSlug/configs/llm-profiles"
                  params={{ projectSlug }}
                  className="underline hover:text-foreground"
                >
                  Set up a profile →
                </Link>
              </p>
            ) : (
              <Combobox
                value={selectedProfile}
                onValueChange={onSelectedProfileChange}
                items={profiles ?? []}
                itemToStringLabel={(p: LLMProfile) =>
                  `${p.name} (${p.provider} / ${p.model})`
                }
                isItemEqualToValue={(a: LLMProfile, b: LLMProfile) =>
                  a.id === b.id
                }
              >
                <ComboboxInput
                  placeholder="Select LLM profile"
                  className="w-full"
                  showClear={!!selectedProfile}
                />
                <ComboboxContent>
                  <ComboboxList>
                    <ComboboxCollection>
                      {(p: LLMProfile) => (
                        <ComboboxItem key={p.id} value={p}>
                          <div className="grid">
                            <span className="truncate text-sm">
                              {p.name}
                              {p.is_default && (
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  (default)
                                </span>
                              )}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {p.provider} · {p.model}
                            </span>
                          </div>
                        </ComboboxItem>
                      )}
                    </ComboboxCollection>
                  </ComboboxList>
                  <ComboboxEmpty>No profiles found</ComboboxEmpty>
                </ComboboxContent>
              </Combobox>
            )}
          </div>

          {/* Source Repository — conditional */}
          {githubEnabled && repos && repos.length > 0 && (
            <div className="grid gap-1.5">
              <Label className="text-label">
                Source Repository (optional)
              </Label>
              <Combobox
                value={selectedRepo}
                onValueChange={onSelectedRepoChange}
                items={repos}
                itemToStringLabel={(r: GitHubRepo) => r.full_name}
                isItemEqualToValue={(a: GitHubRepo, b: GitHubRepo) =>
                  a.full_name === b.full_name
                }
              >
                <ComboboxInput
                  placeholder="Select repository"
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

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onConfigure}
              className="gap-1.5"
            >
              Configure Tools
              <ChevronRight size={14} />
            </Button>
            <Button onClick={onCreate} disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner className="size-4" />
                  Creating…
                </>
              ) : (
                "Create Agent"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
