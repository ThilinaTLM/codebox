import {  useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon, SparklesIcon } from "@hugeicons/core-free-icons"
import { FormField, SectionCard } from "../FormField"
import {
  PromptEditor
  
} from "../prompts/PromptEditor"
import { VariablesPanel } from "../prompts/VariablesPanel"
import type {PromptEditorHandle} from "../prompts/PromptEditor";
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAgentTemplateFormState"
import type {Dispatch} from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

interface PromptsSectionProps {
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
  id?: string
}

export function PromptsSection({
  state,
  dispatch,
  errors,
  id,
}: PromptsSectionProps) {
  const systemRef = useRef<PromptEditorHandle>(null)
  const initialRef = useRef<PromptEditorHandle>(null)
  const [activeEditor, setActiveEditor] = useState<"system" | "initial">(
    "initial"
  )
  const [systemExpanded, setSystemExpanded] = useState(
    state.system_prompt.length > 0
  )

  const insert = (token: string) => {
    const target =
      activeEditor === "system" && systemExpanded
        ? systemRef.current
        : initialRef.current
    target?.insertAtCursor(token)
  }

  return (
    <SectionCard
      id={id}
      title="Prompts"
      description="What the agent reads when it starts. Use variables like ${{ISSUE_TITLE}} to inject event context."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">System prompt</h4>
              <div className="flex items-center gap-2">
                <div className="lg:hidden">
                  <VariablesPopover
                    triggerKind={state.trigger_kind}
                    onInsert={(token) => {
                      setActiveEditor("system")
                      systemRef.current?.insertAtCursor(token)
                    }}
                  />
                </div>
                {!systemExpanded ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setSystemExpanded(true)}
                  >
                    <HugeiconsIcon
                      icon={PlusSignIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Add system prompt
                  </Button>
                ) : (
                  state.system_prompt.length === 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setSystemExpanded(false)}
                    >
                      Remove
                    </Button>
                  )
                )}
              </div>
            </div>
            {systemExpanded ? (
              <FormField
                label={<span className="sr-only">System prompt</span>}
                htmlFor="at-sys"
                description="Optional. Sent as the system message. Keep it concise — this defines the agent's role."
              >
                <PromptEditor
                  ref={systemRef}
                  id="at-sys"
                  value={state.system_prompt}
                  onChange={(v) =>
                    dispatch({ type: "set", patch: { system_prompt: v } })
                  }
                  onFocus={() => setActiveEditor("system")}
                  rows={5}
                  maxLength={16 * 1024}
                  placeholder="You are an expert triage agent for this project…"
                  aria-label="System prompt"
                />
              </FormField>
            ) : (
              <p className="text-xs text-muted-foreground">
                Optional. Defines the agent's role.
              </p>
            )}
          </div>

          <FormField
            label="Initial prompt"
            htmlFor="at-init"
            required
            error={errors.initial_prompt}
            description="Sent as the first user message. This is what the agent starts working on."
          >
            <PromptEditor
              ref={initialRef}
              id="at-init"
              value={state.initial_prompt}
              onChange={(v) =>
                dispatch({ type: "set", patch: { initial_prompt: v } })
              }
              onFocus={() => setActiveEditor("initial")}
              rows={10}
              maxLength={50 * 1024}
              placeholder={`Review the issue below and decide which labels to apply.\n\nIssue:\n\${{ISSUE_CONTENT}}`}
              aria-label="Initial prompt"
              invalid={!!errors.initial_prompt}
              required
            />
          </FormField>
        </div>

        <aside className="hidden max-h-[520px] rounded-xl border border-border/50 bg-muted/20 p-4 lg:flex">
          <VariablesPanel
            triggerKind={state.trigger_kind}
            onInsert={insert}
          />
        </aside>
      </div>
    </SectionCard>
  )
}

function VariablesPopover({
  triggerKind,
  onInsert,
}: {
  triggerKind: FormState["trigger_kind"]
  onInsert: (token: string) => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="xs">
            <HugeiconsIcon
              icon={SparklesIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Variables
          </Button>
        }
      />
      <PopoverContent
        className="flex h-96 w-80 flex-col gap-0 p-4"
        align="end"
      >
        <VariablesPanel triggerKind={triggerKind} onInsert={onInsert} />
      </PopoverContent>
    </Popover>
  )
}
