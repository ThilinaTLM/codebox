import { Link } from "@tanstack/react-router"
import { FormField, SectionCard } from "../FormField"
import { RepoPicker } from "./RepoBranchPickers"
import type {
  FormAction,
  FormErrors,
  FormState,
} from "../useAutomationFormState"
import type { Dispatch } from "react"

interface RepoCardProps {
  id?: string
  projectSlug: string
  state: FormState
  dispatch: Dispatch<FormAction>
  errors: FormErrors
  githubConfigured: boolean
}

/**
 * Wizard step 2 — pick the single repo this automation targets.
 *
 * Required for every automation (including ``schedule``): the repo
 * determines which GitHub installation's token is injected into the
 * agent box, and it's the only gate on which webhooks match this rule.
 */
export function RepoCard({
  id,
  projectSlug,
  state,
  dispatch,
  errors,
  githubConfigured,
}: RepoCardProps) {
  return (
    <SectionCard
      id={id}
      title="Target repository"
      description="The single repo this automation targets. The agent receives a GitHub token scoped to this repo, so it can use the ``gh`` CLI for PRs and commits."
    >
      {!githubConfigured && (
        <p className="text-xs text-muted-foreground">
          No GitHub App is configured for this project.{" "}
          <Link
            to="/projects/$projectSlug/configs/github"
            params={{ projectSlug }}
            search={{ tab: "app" }}
            className="font-medium underline underline-offset-2 hover:text-foreground"
          >
            Configure a GitHub App
          </Link>{" "}
          to enable repo selection.
        </p>
      )}

      <FormField
        label="Repository"
        htmlFor="at-trigger-repo"
        required
        error={errors.trigger_repo}
        description={
          githubConfigured
            ? "Pick from connected repos or type ``owner/name``."
            : "``owner/name`` — e.g. ``my-org/my-repo``."
        }
      >
        <RepoPicker
          id="at-trigger-repo"
          projectSlug={projectSlug}
          githubConfigured={githubConfigured}
          value={state.trigger_repo}
          onChange={(next, matched) => {
            const patch: Partial<FormState> = { trigger_repo: next }
            // Auto-fill pinned_branch when workspace_mode is ``pinned`` and
            // the user hasn't set a branch yet. For scheduled automations
            // this is the common path.
            if (
              matched &&
              state.workspace_mode === "pinned" &&
              state.pinned_branch.trim().length === 0
            ) {
              patch.pinned_branch = matched.default_branch
            }
            dispatch({ type: "set", patch })
          }}
          invalid={!!errors.trigger_repo}
        />
      </FormField>
    </SectionCard>
  )
}
