import { useEffect, useMemo, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import type { BoxCreatePayload, GitHubRepo, LLMProfile } from "@/net/http/types"
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
import { Switch } from "@/components/ui/switch"
import { generateReadableName } from "@/lib/name-generator"
import {
  useCreateBox,
  useGitHubRepos,
  useGitHubStatus,
  useLLMProfiles,
} from "@/net/query"

// ── Route ───────────────────────────────────────────────────

export const Route = createFileRoute("/boxes/create")({
  component: CreateAgentPage,
})

// ── Constants ───────────────────────────────────────────────

const LABEL_CLS =
  "font-terminal text-xs tracking-wider text-ghost uppercase" as const
const INPUT_CLS =
  "h-9 w-full rounded-lg border border-border bg-inset px-3 py-1 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" as const
const TEXTAREA_CLS =
  "w-full resize-none rounded-lg border border-border bg-inset px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" as const
const NUM_INPUT_CLS =
  "h-8 w-20 rounded-lg border border-border bg-inset px-2 py-1 text-sm text-foreground tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" as const
const SECTION_HEADING =
  "font-display text-lg font-semibold" as const

// ── Tag Chips ───────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
}: {
  tags: Array<string>
  onChange: (tags: Array<string>) => void
}) {
  const [input, setInput] = useState("")

  const addTag = () => {
    const trimmed = input.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInput("")
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-inset px-2 py-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            addTag()
          }
          if (e.key === "Backspace" && !input && tags.length > 0) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={addTag}
        placeholder={tags.length === 0 ? "Add tags…" : ""}
        className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

// ── Tool Config Row ─────────────────────────────────────────

function ToolRow({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <Switch checked={enabled} onCheckedChange={onToggle} size="sm" />
      </div>
      {enabled && children && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-2">
          {children}
        </div>
      )}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={NUM_INPUT_CLS}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  )
}

// ── Page ─────────────────────────────────────────────────────

function CreateAgentPage() {
  const navigate = useNavigate()
  const createMutation = useCreateBox()

  // ── Form state ──────────────────────────────────────────
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState<Array<string>>([])
  const [selectedProfile, setSelectedProfile] = useState<LLMProfile | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [systemPrompt, setSystemPrompt] = useState("")
  const [autoStartPrompt, setAutoStartPrompt] = useState("")
  const [recursionLimit, setRecursionLimit] = useState(150)
  const [initBashScript, setInitBashScript] = useState("")

  // Tool toggles
  const [executeEnabled, setExecuteEnabled] = useState(true)
  const [executeTimeout, setExecuteTimeout] = useState(120)
  const [webSearchEnabled, setWebSearchEnabled] = useState(true)
  const [webSearchMaxResults, setWebSearchMaxResults] = useState(5)
  const [webFetchEnabled, setWebFetchEnabled] = useState(true)
  const [webFetchTimeout, setWebFetchTimeout] = useState(30)
  const [filesystemEnabled, setFilesystemEnabled] = useState(true)
  const [taskEnabled, setTaskEnabled] = useState(true)

  // ── Queries ─────────────────────────────────────────────
  const { data: profiles } = useLLMProfiles()
  const { data: githubStatus } = useGitHubStatus()
  const { data: repos } = useGitHubRepos()
  const githubEnabled = githubStatus?.enabled ?? false

  const previewName = useMemo(() => generateReadableName(), [])

  // Pre-select the default profile
  useEffect(() => {
    if (!selectedProfile && profiles) {
      const defaultProfile = profiles.find((p) => p.is_default)
      if (defaultProfile) setSelectedProfile(defaultProfile)
    }
  }, [profiles, selectedProfile])

  // ── Submit ──────────────────────────────────────────────
  const handleCreate = () => {
    const payload: BoxCreatePayload = {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      llm_profile_id: selectedProfile?.id || undefined,
      system_prompt: systemPrompt.trim() || undefined,
      auto_start_prompt: autoStartPrompt.trim() || undefined,
      recursion_limit: recursionLimit !== 150 ? recursionLimit : undefined,
      github_repo: selectedRepo?.full_name || undefined,
      init_bash_script: initBashScript.trim() || undefined,
    }

    // Build tool settings (only include non-defaults)
    const tools: BoxCreatePayload["tools"] = {}
    if (!executeEnabled) {
      tools.execute = { enabled: false }
    } else if (executeTimeout !== 120) {
      tools.execute = { enabled: true, timeout: executeTimeout }
    }
    if (!webSearchEnabled) {
      tools.web_search = { enabled: false }
    } else if (webSearchMaxResults !== 5) {
      tools.web_search = { enabled: true, max_results: webSearchMaxResults }
    }
    if (!webFetchEnabled) {
      tools.web_fetch = { enabled: false }
    } else if (webFetchTimeout !== 30) {
      tools.web_fetch = { enabled: true, timeout: webFetchTimeout }
    }
    if (!filesystemEnabled) tools.filesystem = { enabled: false }
    if (!taskEnabled) tools.task = { enabled: false }

    if (Object.keys(tools).length > 0) payload.tools = tools

    createMutation.mutate(payload, {
      onSuccess: (box) => {
        toast.success("Agent created")
        navigate({ to: "/boxes/$boxId", params: { boxId: box.id } })
      },
      onError: () => toast.error("Failed to create agent"),
    })
  }

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      {/* Sticky header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate({ to: "/" })}
          >
            <ArrowLeft size={16} />
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Create Agent
          </h1>
        </div>
        <Button
          onClick={handleCreate}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "Creating…" : "Create Agent"}
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-16 pt-8">
        <div className="mx-auto max-w-3xl space-y-10">
          {/* ── General ──────────────────────────────────── */}
          <section>
            <h2 className={SECTION_HEADING}>General</h2>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="agent-name" className={LABEL_CLS}>
                    Name
                  </Label>
                  <input
                    id="agent-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={previewName}
                    className={INPUT_CLS}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="agent-desc" className={LABEL_CLS}>
                    Description
                  </Label>
                  <input
                    id="agent-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this agent for?"
                    className={INPUT_CLS}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className={LABEL_CLS}>Tags</Label>
                <TagInput tags={tags} onChange={setTags} />
              </div>
            </div>
          </section>

          {/* ── LLM Profile ──────────────────────────────── */}
          <section>
            <h2 className={SECTION_HEADING}>LLM Profile</h2>
            <div className="mt-4 space-y-4">
              {profiles && profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No LLM profiles configured.{" "}
                  <a href="/settings" className="underline hover:text-foreground">
                    Create one in Settings
                  </a>
                </p>
              ) : (
                <div className="grid gap-1.5">
                  <Label className={LABEL_CLS}>Profile</Label>
                  <Combobox
                    value={selectedProfile}
                    onValueChange={setSelectedProfile}
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
                      <ComboboxEmpty>
                        No profiles found
                      </ComboboxEmpty>
                    </ComboboxContent>
                  </Combobox>
                </div>
              )}
            </div>
          </section>

          {/* ── Source ────────────────────────────────────── */}
          <section>
            <h2 className={SECTION_HEADING}>Source</h2>
            <div className="mt-4 space-y-4">
              {/* GitHub Repo */}
              {githubEnabled && (
                <div className="grid gap-1.5">
                  <Label className={LABEL_CLS}>GitHub Repo</Label>
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

              {/* Init Script */}
              <div className="grid gap-1.5">
                <Label htmlFor="init-script" className={LABEL_CLS}>
                  Init Script
                </Label>
                <textarea
                  id="init-script"
                  value={initBashScript}
                  onChange={(e) => setInitBashScript(e.target.value)}
                  placeholder={"#!/bin/bash\n# Runs after repo clone, before agent starts"}
                  rows={5}
                  className={`font-mono ${TEXTAREA_CLS}`}
                />
                <p className="text-xs text-muted-foreground">
                  Bash script executed inside the container before the agent
                  starts.
                </p>
              </div>
            </div>
          </section>

          {/* ── Prompts ──────────────────────────────────── */}
          <section>
            <h2 className={SECTION_HEADING}>Prompts</h2>
            <div className="mt-4 space-y-4">
              {/* System Prompt */}
              <div className="grid gap-1.5">
                <Label htmlFor="system-prompt" className={LABEL_CLS}>
                  System Prompt
                </Label>
                <textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Custom instructions for the agent (optional)"
                  rows={6}
                  className={TEXTAREA_CLS}
                />
              </div>

              {/* Initial Prompt */}
              <div className="grid gap-1.5">
                <Label htmlFor="auto-start-prompt" className={LABEL_CLS}>
                  Initial Prompt
                </Label>
                <textarea
                  id="auto-start-prompt"
                  value={autoStartPrompt}
                  onChange={(e) => setAutoStartPrompt(e.target.value)}
                  placeholder="What should the agent work on?"
                  rows={8}
                  className={`font-terminal ${TEXTAREA_CLS}`}
                />
              </div>
            </div>
          </section>

          {/* ── Tools ────────────────────────────────────── */}
          <section>
            <h2 className={SECTION_HEADING}>Tools</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <ToolRow
                label="Shell Execute"
                enabled={executeEnabled}
                onToggle={setExecuteEnabled}
              >
                <NumberField
                  label="Timeout"
                  value={executeTimeout}
                  onChange={setExecuteTimeout}
                  suffix="s"
                />
              </ToolRow>

              <ToolRow
                label="Web Search"
                enabled={webSearchEnabled}
                onToggle={setWebSearchEnabled}
              >
                <NumberField
                  label="Max results"
                  value={webSearchMaxResults}
                  onChange={setWebSearchMaxResults}
                />
              </ToolRow>

              <ToolRow
                label="Web Fetch"
                enabled={webFetchEnabled}
                onToggle={setWebFetchEnabled}
              >
                <NumberField
                  label="Timeout"
                  value={webFetchTimeout}
                  onChange={setWebFetchTimeout}
                  suffix="s"
                />
              </ToolRow>

              <ToolRow
                label="File System"
                enabled={filesystemEnabled}
                onToggle={setFilesystemEnabled}
              />

              <ToolRow
                label="Sub-Agents"
                enabled={taskEnabled}
                onToggle={setTaskEnabled}
              />
            </div>
          </section>

          {/* ── Limits ───────────────────────────────────── */}
          <section>
            <h2 className={SECTION_HEADING}>Limits</h2>
            <div className="mt-4">
              <div className="grid gap-1.5">
                <Label className={LABEL_CLS}>Recursion Limit</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={recursionLimit}
                    onChange={(e) => setRecursionLimit(Number(e.target.value))}
                    className={`${INPUT_CLS} max-w-[120px]`}
                  />
                  <span className="text-xs text-muted-foreground">
                    Max LLM calls per task (1–1000)
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
