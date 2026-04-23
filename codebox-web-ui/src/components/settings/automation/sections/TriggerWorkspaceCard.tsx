import { SectionCard } from "../FormField"
import { TriggerFields } from "./TriggerSection"
import { WorkspaceFields } from "./WorkspaceSection"
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAutomationFormState"
import type { Dispatch } from "react"

interface TriggerWorkspaceCardProps {
  id?: string
  projectSlug: string
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
  nextRunAt?: string | null
  githubConfigured: boolean
}

export function TriggerWorkspaceCard({
  id,
  projectSlug,
  state,
  dispatch,
  errors,
  nextRunAt,
  githubConfigured,
}: TriggerWorkspaceCardProps) {
  return (
    <SectionCard
      id={id}
      title="Trigger & Workspace"
      description="When this automation runs and where the agent does its work."
    >
      <TriggerFields
        projectSlug={projectSlug}
        state={state}
        dispatch={dispatch}
        errors={errors}
        nextRunAt={nextRunAt}
        githubConfigured={githubConfigured}
      />
      <WorkspaceFields
        projectSlug={projectSlug}
        state={state}
        dispatch={dispatch}
        errors={errors}
        githubConfigured={githubConfigured}
      />
    </SectionCard>
  )
}
