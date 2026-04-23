import { SectionCard } from "../FormField"
import { PromptsFields } from "./PromptsSection"
import type { Dispatch } from "react"
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAutomationFormState"

interface PromptsCardProps {
  id?: string
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
}

export function PromptsCard({
  id,
  state,
  dispatch,
  errors,
}: PromptsCardProps) {
  return (
    <SectionCard
      id={id}
      title="Prompts"
      description="What the agent reads when it starts. Type ``${{`` inside either editor to get variable suggestions, or pick one from the panel on the right."
    >
      <PromptsFields state={state} dispatch={dispatch} errors={errors} />
    </SectionCard>
  )
}
