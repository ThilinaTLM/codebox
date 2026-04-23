import { SectionCard } from "../FormField"
import { AgentFields } from "./AgentSection"
import { BasicsFields } from "./BasicsSection"
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAutomationFormState"
import type { Dispatch } from "react"

interface BasicsCardProps {
  id?: string
  projectSlug: string
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
}

export function BasicsCard({
  id,
  projectSlug,
  state,
  dispatch,
  errors,
}: BasicsCardProps) {
  return (
    <SectionCard
      id={id}
      title="Basics"
      description="Name, description, status, and which LLM profile runs this agent."
    >
      <BasicsFields state={state} dispatch={dispatch} errors={errors} />
      <AgentFields
        projectSlug={projectSlug}
        state={state}
        dispatch={dispatch}
      />
    </SectionCard>
  )
}
