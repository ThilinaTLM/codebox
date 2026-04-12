import { ArrowLeft, ChevronRight } from "lucide-react"
import { NumberField, ToolConfigRow } from "./ToolConfigRow"
import { TagInput } from "./TagInput"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

const INPUT_CLS =
  "h-9 w-full rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground transition-colors duration-fast outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" as const
const TEXTAREA_CLS =
  "w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors duration-fast outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" as const

interface CreateBoxStepTwoProps {
  // Form state
  systemPrompt: string
  onSystemPromptChange: (v: string) => void
  description: string
  onDescriptionChange: (v: string) => void
  tags: Array<string>
  onTagsChange: (v: Array<string>) => void
  initBashScript: string
  onInitBashScriptChange: (v: string) => void
  recursionLimit: number
  onRecursionLimitChange: (v: number) => void
  // Tool toggles
  executeEnabled: boolean
  onExecuteEnabledChange: (v: boolean) => void
  executeTimeout: number
  onExecuteTimeoutChange: (v: number) => void
  webSearchEnabled: boolean
  onWebSearchEnabledChange: (v: boolean) => void
  webSearchMaxResults: number
  onWebSearchMaxResultsChange: (v: number) => void
  webFetchEnabled: boolean
  onWebFetchEnabledChange: (v: boolean) => void
  webFetchTimeout: number
  onWebFetchTimeoutChange: (v: number) => void
  filesystemEnabled: boolean
  onFilesystemEnabledChange: (v: boolean) => void
  taskEnabled: boolean
  onTaskEnabledChange: (v: boolean) => void
  // Actions
  isPending: boolean
  onBack: () => void
  onCreate: () => void
}

export function CreateBoxStepTwo({
  systemPrompt,
  onSystemPromptChange,
  description,
  onDescriptionChange,
  tags,
  onTagsChange,
  initBashScript,
  onInitBashScriptChange,
  recursionLimit,
  onRecursionLimitChange,
  executeEnabled,
  onExecuteEnabledChange,
  executeTimeout,
  onExecuteTimeoutChange,
  webSearchEnabled,
  onWebSearchEnabledChange,
  webSearchMaxResults,
  onWebSearchMaxResultsChange,
  webFetchEnabled,
  onWebFetchEnabledChange,
  webFetchTimeout,
  onWebFetchTimeoutChange,
  filesystemEnabled,
  onFilesystemEnabledChange,
  taskEnabled,
  onTaskEnabledChange,
  isPending,
  onBack,
  onCreate,
}: CreateBoxStepTwoProps) {
  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={onBack}>
            <ArrowLeft size={16} />
          </Button>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Configure Tools
          </h1>
        </div>
        <span className="text-xs text-muted-foreground">Step 2 of 2</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-16 pt-8">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* System Prompt */}
          <div className="grid gap-1.5">
            <Label htmlFor="system-prompt" className="text-label">
              System Prompt (optional)
            </Label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="Uses default agent prompt if empty"
              rows={4}
              className={TEXTAREA_CLS}
            />
          </div>

          {/* Tools */}
          <div>
            <h2 className="text-label mb-3">Tools</h2>
            <div className="grid grid-cols-2 gap-3">
              <ToolConfigRow
                label="Shell Execute"
                enabled={executeEnabled}
                onToggle={onExecuteEnabledChange}
              >
                <NumberField
                  label="Timeout"
                  value={executeTimeout}
                  onChange={onExecuteTimeoutChange}
                  suffix="s"
                />
              </ToolConfigRow>

              <ToolConfigRow
                label="Web Search"
                enabled={webSearchEnabled}
                onToggle={onWebSearchEnabledChange}
              >
                <NumberField
                  label="Max results"
                  value={webSearchMaxResults}
                  onChange={onWebSearchMaxResultsChange}
                />
              </ToolConfigRow>

              <ToolConfigRow
                label="Web Fetch"
                enabled={webFetchEnabled}
                onToggle={onWebFetchEnabledChange}
              >
                <NumberField
                  label="Timeout"
                  value={webFetchTimeout}
                  onChange={onWebFetchTimeoutChange}
                  suffix="s"
                />
              </ToolConfigRow>

              <ToolConfigRow
                label="File System"
                enabled={filesystemEnabled}
                onToggle={onFilesystemEnabledChange}
              />

              <ToolConfigRow
                label="Sub-Agents"
                enabled={taskEnabled}
                onToggle={onTaskEnabledChange}
              />
            </div>
          </div>

          {/* Advanced Options — collapsible */}
          <Collapsible>
            <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&[data-panel-open]>svg]:rotate-90">
              <ChevronRight
                size={14}
                className="shrink-0 transition-transform duration-150"
              />
              Advanced Options
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 space-y-4">
                {/* Description */}
                <div className="grid gap-1.5">
                  <Label htmlFor="agent-desc" className="text-label">
                    Description
                  </Label>
                  <textarea
                    id="agent-desc"
                    value={description}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                    placeholder="What is this agent for?"
                    rows={2}
                    className={TEXTAREA_CLS}
                  />
                </div>

                {/* Tags */}
                <div className="grid gap-1.5">
                  <Label className="text-label">Tags</Label>
                  <TagInput tags={tags} onChange={onTagsChange} />
                </div>

                {/* Init Script */}
                <div className="grid gap-1.5">
                  <Label htmlFor="init-script" className="text-label">
                    Init Script
                  </Label>
                  <textarea
                    id="init-script"
                    value={initBashScript}
                    onChange={(e) => onInitBashScriptChange(e.target.value)}
                    placeholder={
                      "#!/bin/bash\n# Bash commands to run before the agent starts"
                    }
                    rows={4}
                    className={`font-mono ${TEXTAREA_CLS}`}
                  />
                </div>

                {/* Recursion Limit */}
                <div className="grid gap-1.5">
                  <Label className="text-label">Recursion Limit</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={recursionLimit}
                      onChange={(e) =>
                        onRecursionLimitChange(Number(e.target.value))
                      }
                      className={`${INPUT_CLS} max-w-[120px]`}
                    />
                    <span className="text-xs text-muted-foreground">
                      Maximum agent iterations. Higher = longer tasks possible.
                    </span>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Submit */}
          <div className="flex items-center justify-end pt-4">
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
