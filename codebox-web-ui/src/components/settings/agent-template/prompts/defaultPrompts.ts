/**
 * Default prompt content used when seeding a brand-new agent template.
 *
 * The wizard's ``emptyState`` populates these on mount. The trigger-aware
 * initial prompt is also re-applied if the user switches the trigger
 * before touching the initial prompt — so each trigger feels coherent
 * out of the box.
 */

import type { AgentTemplateTriggerKind } from "@/net/http/types"

export const DEFAULT_SYSTEM_PROMPT =
  "You are an AI engineering agent working in the ${{PROJECT_NAME}} project.\n" +
  "Follow the project's conventions and keep your changes focused, small, " +
  "and well-scoped. Explain your reasoning in your final reply."

const DEFAULTS: Record<AgentTemplateTriggerKind, string> = {
  "github.issues":
    "A new issue was just opened on ${{REPO_FULL_NAME}}.\n\n" +
    "Read the issue carefully, decide whether you have enough information to " +
    "act, and either ask clarifying questions or propose a plan and " +
    "implement it.\n\n" +
    "Issue:\n${{ISSUE_CONTENT}}",

  "github.issue_comment":
    "${{COMMENT_AUTHOR}} just commented on ${{REPO_FULL_NAME}}#${{ISSUE_NUMBER}}.\n\n" +
    "Comment:\n${{COMMENT_BODY}}\n\n" +
    "Original issue:\n${{ISSUE_CONTENT}}\n\n" +
    "Respond to the comment and take any actions it asks for.",

  "github.pull_request":
    "A pull request was just updated on ${{REPO_FULL_NAME}} " +
    "(${{PR_HEAD_REF}} → ${{PR_BASE_REF}}).\n\n" +
    "Review the diff, run the project's tests if relevant, and leave a " +
    "concise summary of risks, suggestions, and any code you would change.\n\n" +
    "PR:\n${{PR_CONTENT}}",

  "github.pull_request_review":
    "${{REVIEW_AUTHOR}} just submitted a ${{REVIEW_STATE}} review on " +
    "${{REPO_FULL_NAME}}#${{PR_NUMBER}}.\n\n" +
    "Review summary:\n${{REVIEW_BODY}}\n\n" +
    "Address the feedback or follow up with a question if anything is unclear.",

  "github.pull_request_review_comment":
    "${{REVIEW_COMMENT_AUTHOR}} left an inline comment on " +
    "${{REVIEW_COMMENT_PATH}} in ${{REPO_FULL_NAME}}#${{PR_NUMBER}}.\n\n" +
    "Comment:\n${{REVIEW_COMMENT_BODY}}\n\n" +
    "Investigate the cited code and respond.",

  "github.push":
    "${{PUSH_PUSHER}} pushed ${{PUSH_COMMIT_COUNT}} commit(s) to " +
    "${{PUSH_REF}} on ${{REPO_FULL_NAME}}.\n\n" +
    "Commits:\n${{PUSH_COMMITS}}\n\n" +
    "Inspect the changes and call out anything that looks risky.",

  schedule:
    "It's time for the scheduled run of this agent on ${{REPO_FULL_NAME}}.\n\n" +
    "Triggered at: ${{TRIGGERED_AT}}\n\n" +
    "Perform the recurring task this template is responsible for.",
}

export function defaultInitialPrompt(
  kind: AgentTemplateTriggerKind,
): string {
  return DEFAULTS[kind]
}

/** Set of every default initial prompt — used to detect "user has not edited". */
const DEFAULT_VALUES: ReadonlySet<string> = new Set(Object.values(DEFAULTS))

/**
 * Returns true when the given text is one of the seeded default initial
 * prompts (so the wizard can safely swap it when the trigger changes).
 */
export function isDefaultInitialPrompt(text: string): boolean {
  return DEFAULT_VALUES.has(text)
}
