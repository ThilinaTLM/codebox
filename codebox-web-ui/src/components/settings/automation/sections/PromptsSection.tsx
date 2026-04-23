import { useMemo, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon } from "@hugeicons/core-free-icons"
import { FormField } from "../FormField"
import { PromptEditor } from "../prompts/PromptEditor"
import { VariablesPanel } from "../prompts/VariablesPanel"
import { flatVariablesFor } from "../variableCatalog"
import type { PromptEditorHandle } from "../prompts/PromptEditor"
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAutomationFormState"
import type { Dispatch } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

interface PromptsFieldsProps {
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
}

export function PromptsFields({
  state,
  dispatch,
  errors,
}: PromptsFieldsProps) {
  const systemRef = useRef<PromptEditorHandle>(null)
  const initialRef = useRef<PromptEditorHandle>(null)
  const [activeEditor, setActiveEditor] = useState<"system" | "initial">(
    "initial",
  )

  const variables = useMemo(
    () => flatVariablesFor(state.trigger_kind),
    [state.trigger_kind],
  )

  const insert = (token: string) => {
    const target =
      activeEditor === "system" ? systemRef.current : initialRef.current
    target?.insertAtCursor(token)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">System prompt</h4>
              <div className="lg:hidden">
                <VariablesPopover
                  triggerKind={state.trigger_kind}
                  onInsert={(token) => {
                    setActiveEditor("system")
                    systemRef.current?.insertAtCursor(token)
                  }}
                />
              </div>
            </div>
            <FormField
              label={<span className="sr-only">System prompt</span>}
              htmlFor="at-sys"
              description="Sent as the system message. Defines the agent's role. Clear the field to skip the system message."
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
                variables={variables}
              />
            </FormField>
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
              variables={variables}
            />
          </FormField>
        </div>

        <aside className="hidden max-h-[560px] rounded-xl border border-border/50 bg-muted/20 p-4 lg:flex">
          <VariablesPanel
            triggerKind={state.trigger_kind}
            onInsert={insert}
          />
        </aside>
    </div>
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
