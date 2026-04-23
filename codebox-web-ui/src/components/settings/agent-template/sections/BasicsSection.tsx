import { FormField, SectionCard } from "../FormField"
import type { Dispatch } from "react"
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAgentTemplateFormState"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

interface BasicsSectionProps {
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
  id?: string
}

export function BasicsSection({
  state,
  dispatch,
  errors,
  id,
}: BasicsSectionProps) {
  return (
    <SectionCard
      id={id}
      title="Basics"
      description="Name, description, and whether this template is active."
    >
      <FormField
        label="Name"
        htmlFor="at-name"
        required
        error={errors.name}
        description="A short human-readable name. Shown in the templates list."
      >
        <Input
          id="at-name"
          value={state.name}
          onChange={(e) =>
            dispatch({ type: "set", patch: { name: e.target.value } })
          }
          maxLength={255}
          placeholder="e.g. Triage new issues"
          aria-invalid={!!errors.name || undefined}
        />
      </FormField>

      <FormField
        label="Description"
        htmlFor="at-description"
        description="Optional. Explain what this template does. Visible only to project admins."
      >
        <Textarea
          id="at-description"
          value={state.description}
          onChange={(e) =>
            dispatch({
              type: "set",
              patch: { description: e.target.value },
            })
          }
          rows={2}
          maxLength={2048}
          placeholder="Triages new issues using the project's default labels."
        />
      </FormField>

      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3">
        <div className="space-y-0.5">
          <Label htmlFor="at-enabled">Enabled</Label>
          <p className="text-xs text-muted-foreground">
            Disabled templates skip all matching events.
          </p>
        </div>
        <Switch
          id="at-enabled"
          checked={state.enabled}
          onCheckedChange={(checked) =>
            dispatch({ type: "set", patch: { enabled: checked } })
          }
        />
      </div>
    </SectionCard>
  )
}
