import { SectionCard } from "../FormField"
import { TriggerFields } from "./TriggerSection"
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

/**
 * Wizard step 3 — trigger kind + (actions | cron) + advanced disclosures
 * for workspace mode overrides and additional event filters.
 *
 * Repo is no longer picked here — it's a dedicated earlier step because a
 * single-repo scope is required for every automation.
 */
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
      title="Trigger"
      description="When this automation runs. Workspace and filter overrides live in the advanced disclosures below."
    >
      <TriggerFields
        projectSlug={projectSlug}
        state={state}
        dispatch={dispatch}
        errors={errors}
        nextRunAt={nextRunAt}
        githubConfigured={githubConfigured}
      />
    </SectionCard>
  )
}
