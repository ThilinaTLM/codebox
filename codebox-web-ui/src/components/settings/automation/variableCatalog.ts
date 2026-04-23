/**
 * Prompt-variable catalog surfaced by ``VariablesPanel``.
 *
 * Mirrors the variables produced by the backend's context builders in
 * ``codebox-orchestrator/src/codebox_orchestrator/automation/application/context_builders/``.
 * If the backend adds, renames, or removes variables, update this file.
 * Dry-run remains the authoritative view of what an automation actually sees
 * at render time.
 *
 * The example values below are designed to match the fixtures in
 * ``dryRunScenarios.ts`` so that a user clicking through the dry-run
 * panel sees matching values.
 */

import type { AutomationTriggerKind } from "@/net/http/types"

export interface VariableEntry {
  name: string
  description: string
  /** Short sample rendered value to help readers reason about the variable. */
  example: string
  /** Optional longer explanation or caveat surfaced in the expanded state. */
  notes?: string
  /** Variables that only resolve at runtime (e.g. API-fetched content). */
  runtimeOnly?: boolean
}

export interface VariableGroup {
  id: string
  title: string
  items: ReadonlyArray<VariableEntry>
}

const BASE_GROUP: VariableGroup = {
  id: "base",
  title: "Project & trigger",
  items: [
    {
      name: "PROJECT_SLUG",
      description: "Slug of the owning project.",
      example: "acme-platform",
    },
    {
      name: "PROJECT_NAME",
      description: "Display name of the project.",
      example: "Acme Platform",
    },
    {
      name: "TRIGGER_KIND",
      description: "The trigger kind that fired this automation.",
      example: "github.issues",
    },
    {
      name: "TRIGGERED_AT",
      description: "ISO 8601 timestamp for when the trigger fired.",
      example: "2025-04-23T09:00:00Z",
    },
  ],
}

const REPO_GROUP: VariableGroup = {
  id: "repo",
  title: "Repository",
  items: [
    {
      name: "REPO_URL",
      description: "HTML URL of the repository.",
      example: "https://github.com/my-org/my-repo",
    },
    {
      name: "REPO_FULL_NAME",
      description: "Full ``owner/name`` of the repository.",
      example: "my-org/my-repo",
    },
    {
      name: "REPO_DEFAULT_BRANCH",
      description: "Default branch name of the repository.",
      example: "main",
    },
  ],
}

const ISSUE_GROUP: VariableGroup = {
  id: "issue",
  title: "Issue",
  items: [
    {
      name: "ISSUE_URL",
      description: "HTML URL of the issue.",
      example: "https://github.com/my-org/my-repo/issues/42",
    },
    {
      name: "ISSUE_NUMBER",
      description: "Issue number.",
      example: "42",
    },
    {
      name: "ISSUE_TITLE",
      description: "Issue title.",
      example: "Login button not responsive on mobile",
    },
    {
      name: "ISSUE_BODY",
      description: "Issue body (raw markdown).",
      example: "Steps to reproduce:\n1. Open /login on iOS Safari\n2. Tap the button ...",
    },
    {
      name: "ISSUE_LABELS",
      description: "Comma-separated list of issue labels.",
      example: "bug, priority/high",
    },
    {
      name: "ISSUE_AUTHOR",
      description: "Login of the issue author.",
      example: "octocat",
    },
    {
      name: "ISSUE_STATE",
      description: "Issue state (``open`` / ``closed``).",
      example: "open",
    },
    {
      name: "ISSUE_ACTION",
      description: "The webhook action for this event (e.g. ``opened``).",
      example: "opened",
      notes:
        "See GitHub's issues event docs for the full list of actions (opened, edited, labeled, closed, …).",
    },
    {
      name: "ISSUE_CONTENT",
      description: "Markdown block with the title + body.",
      example: "# Login button not responsive on mobile\n\nSteps to reproduce:\n1. ...",
      notes:
        "Convenient shortcut to drop both title and body into a prompt as one Markdown block.",
    },
    {
      name: "ISSUE_COMMENTS",
      description: "Rendered thread of existing issue comments.",
      example:
        "**octocat** (2025-04-22T10:00Z):\nThanks for reporting. Can you share the browser version?",
      notes:
        "Fetched from GitHub when the agent starts, so this is only available at run time — dry-run shows a placeholder.",
      runtimeOnly: true,
    },
  ],
}

const ISSUE_COMMENT_GROUP: VariableGroup = {
  id: "issue_comment",
  title: "Comment",
  items: [
    {
      name: "COMMENT_BODY",
      description: "Body of the comment that triggered the event.",
      example: "Could you check if this reproduces on Android too?",
    },
    {
      name: "COMMENT_AUTHOR",
      description: "Login of the commenter.",
      example: "octocat",
    },
    {
      name: "COMMENT_URL",
      description: "Permalink to the triggering comment.",
      example:
        "https://github.com/my-org/my-repo/issues/42#issuecomment-1234567890",
    },
  ],
}

const PR_GROUP: VariableGroup = {
  id: "pr",
  title: "Pull request",
  items: [
    {
      name: "PR_URL",
      description: "HTML URL of the pull request.",
      example: "https://github.com/my-org/my-repo/pull/17",
    },
    {
      name: "PR_NUMBER",
      description: "Pull request number.",
      example: "17",
    },
    {
      name: "PR_TITLE",
      description: "Pull request title.",
      example: "Add OAuth2 login",
    },
    {
      name: "PR_BODY",
      description: "Pull request body (raw markdown).",
      example: "This PR adds Google OAuth.\n\n- Adds /auth/callback\n- Adds session cookie",
    },
    {
      name: "PR_LABELS",
      description: "Comma-separated list of PR labels.",
      example: "enhancement, needs-review",
    },
    {
      name: "PR_AUTHOR",
      description: "Login of the PR author.",
      example: "octocat",
    },
    {
      name: "PR_STATE",
      description: "PR state (``open`` / ``closed``).",
      example: "open",
    },
    {
      name: "PR_ACTION",
      description: "The webhook action (e.g. ``opened``, ``synchronize``).",
      example: "opened",
      notes:
        "Common actions: opened, synchronize (new commits pushed), ready_for_review, closed, reopened.",
    },
    {
      name: "PR_BASE_REF",
      description: "Target branch name.",
      example: "main",
    },
    {
      name: "PR_HEAD_REF",
      description: "Source branch name.",
      example: "feature/example",
    },
    {
      name: "PR_CONTENT",
      description: "Markdown block with the title + body.",
      example: "# Add OAuth2 login\n\nThis PR adds Google OAuth ...",
    },
    {
      name: "PR_COMMENTS",
      description: "Rendered thread of PR conversation comments.",
      example:
        "**octocat** (2025-04-22T10:00Z):\nCan we add a test for the callback?",
      notes:
        "Conversation comments only — see PR_REVIEW_COMMENTS for inline review remarks. Runtime-only.",
      runtimeOnly: true,
    },
    {
      name: "PR_REVIEW_COMMENTS",
      description: "Rendered thread of inline review comments.",
      example:
        "**octocat** on `src/auth.ts:42`:\nSuggest extracting this into a helper.",
      notes: "Fetched from GitHub at run time, not during dry-run.",
      runtimeOnly: true,
    },
  ],
}

const PR_REVIEW_GROUP: VariableGroup = {
  id: "pr_review",
  title: "Review",
  items: [
    {
      name: "REVIEW_STATE",
      description: "Review state (``approved``, ``changes_requested``, …).",
      example: "approved",
    },
    {
      name: "REVIEW_BODY",
      description: "Summary body of the review.",
      example: "LGTM, just a couple of suggestions inline.",
    },
    {
      name: "REVIEW_AUTHOR",
      description: "Login of the reviewer.",
      example: "octocat",
    },
    {
      name: "REVIEW_URL",
      description: "Permalink to the review.",
      example:
        "https://github.com/my-org/my-repo/pull/17#pullrequestreview-987654321",
    },
  ],
}

const PR_REVIEW_COMMENT_GROUP: VariableGroup = {
  id: "pr_review_comment",
  title: "Review comment",
  items: [
    {
      name: "REVIEW_COMMENT_BODY",
      description: "Body of the inline review comment.",
      example: "Consider renaming this to `handleCallback`.",
    },
    {
      name: "REVIEW_COMMENT_AUTHOR",
      description: "Login of the inline comment author.",
      example: "octocat",
    },
    {
      name: "REVIEW_COMMENT_PATH",
      description: "Path of the file commented on.",
      example: "src/auth.ts",
    },
    {
      name: "REVIEW_COMMENT_URL",
      description: "Permalink to the inline comment.",
      example:
        "https://github.com/my-org/my-repo/pull/17#discussion_r1234567890",
    },
  ],
}

const PUSH_GROUP: VariableGroup = {
  id: "push",
  title: "Push",
  items: [
    {
      name: "PUSH_REF",
      description: "Ref that was pushed (``refs/heads/main``, …).",
      example: "refs/heads/main",
    },
    {
      name: "PUSH_PUSHER",
      description: "Login of the user that pushed.",
      example: "octocat",
    },
    {
      name: "PUSH_COMMIT_COUNT",
      description: "Number of commits in the push.",
      example: "3",
    },
    {
      name: "PUSH_COMMITS",
      description: "Rendered list of commit messages.",
      example:
        "- abc1234 Fix typo in README\n- def5678 Bump dependency X\n- 9012345 Add missing test",
    },
  ],
}

export const VARIABLE_CATALOG: Record<
  AutomationTriggerKind,
  ReadonlyArray<VariableGroup>
> = {
  "github.issues": [BASE_GROUP, REPO_GROUP, ISSUE_GROUP],
  "github.issue_comment": [
    BASE_GROUP,
    REPO_GROUP,
    ISSUE_GROUP,
    ISSUE_COMMENT_GROUP,
  ],
  "github.pull_request": [BASE_GROUP, REPO_GROUP, PR_GROUP],
  "github.pull_request_review": [
    BASE_GROUP,
    REPO_GROUP,
    PR_GROUP,
    PR_REVIEW_GROUP,
  ],
  "github.pull_request_review_comment": [
    BASE_GROUP,
    REPO_GROUP,
    PR_GROUP,
    PR_REVIEW_COMMENT_GROUP,
  ],
  "github.push": [BASE_GROUP, REPO_GROUP, PUSH_GROUP],
  schedule: [BASE_GROUP, REPO_GROUP],
}

const ALL_TRIGGER_KINDS = Object.keys(
  VARIABLE_CATALOG,
) as Array<AutomationTriggerKind>

/**
 * Compute the list of trigger kinds that expose a given variable name.
 * Used by the variables panel to show "Available for: …" per entry.
 */
export function triggersExposing(
  name: string,
): ReadonlyArray<AutomationTriggerKind> {
  const out: Array<AutomationTriggerKind> = []
  for (const kind of ALL_TRIGGER_KINDS) {
    for (const group of VARIABLE_CATALOG[kind]) {
      if (group.items.some((v) => v.name === name)) {
        out.push(kind)
        break
      }
    }
  }
  return out
}

/**
 * Flattened list of unique variable entries across every trigger kind.
 * Useful for the ``${{`` autocomplete inside ``PromptEditor`` when the
 * caller wants trigger-aware suggestions.
 */
export function flatVariablesFor(
  triggerKind: AutomationTriggerKind,
): ReadonlyArray<VariableEntry> {
  const seen = new Set<string>()
  const out: Array<VariableEntry> = []
  for (const group of VARIABLE_CATALOG[triggerKind]) {
    for (const item of group.items) {
      if (!seen.has(item.name)) {
        seen.add(item.name)
        out.push(item)
      }
    }
  }
  return out
}
