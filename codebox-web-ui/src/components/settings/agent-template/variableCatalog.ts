/**
 * Prompt-variable catalog surfaced by ``VariablesPanel``.
 *
 * Mirrors the variables produced by the backend's context builders in
 * ``codebox-orchestrator/src/codebox_orchestrator/agent_template/application/context_builders/``.
 * If the backend adds, renames, or removes variables, update this file.
 * Dry-run remains the authoritative view of what a template actually sees
 * at render time.
 */

import type { AgentTemplateTriggerKind } from "@/net/http/types"

export interface VariableEntry {
  name: string
  description: string
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
    { name: "PROJECT_SLUG", description: "Slug of the owning project." },
    { name: "PROJECT_NAME", description: "Display name of the project." },
    {
      name: "TRIGGER_KIND",
      description: "The trigger kind that fired this template.",
    },
    {
      name: "TRIGGERED_AT",
      description: "ISO 8601 timestamp for when the trigger fired.",
    },
  ],
}

const REPO_GROUP: VariableGroup = {
  id: "repo",
  title: "Repository",
  items: [
    { name: "REPO_URL", description: "HTML URL of the repository." },
    {
      name: "REPO_FULL_NAME",
      description: "Full ``owner/name`` of the repository.",
    },
    {
      name: "REPO_DEFAULT_BRANCH",
      description: "Default branch name of the repository.",
    },
  ],
}

const ISSUE_GROUP: VariableGroup = {
  id: "issue",
  title: "Issue",
  items: [
    { name: "ISSUE_URL", description: "HTML URL of the issue." },
    { name: "ISSUE_NUMBER", description: "Issue number." },
    { name: "ISSUE_TITLE", description: "Issue title." },
    { name: "ISSUE_BODY", description: "Issue body (raw markdown)." },
    {
      name: "ISSUE_LABELS",
      description: "Comma-separated list of issue labels.",
    },
    { name: "ISSUE_AUTHOR", description: "Login of the issue author." },
    { name: "ISSUE_STATE", description: "Issue state (``open`` / ``closed``)." },
    {
      name: "ISSUE_ACTION",
      description: "The webhook action for this event (e.g. ``opened``).",
    },
    {
      name: "ISSUE_CONTENT",
      description: "Markdown block with the title + body.",
    },
    {
      name: "ISSUE_COMMENTS",
      description: "Rendered thread of existing issue comments.",
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
    },
    {
      name: "COMMENT_AUTHOR",
      description: "Login of the commenter.",
    },
    {
      name: "COMMENT_URL",
      description: "Permalink to the triggering comment.",
    },
  ],
}

const PR_GROUP: VariableGroup = {
  id: "pr",
  title: "Pull request",
  items: [
    { name: "PR_URL", description: "HTML URL of the pull request." },
    { name: "PR_NUMBER", description: "Pull request number." },
    { name: "PR_TITLE", description: "Pull request title." },
    { name: "PR_BODY", description: "Pull request body (raw markdown)." },
    { name: "PR_LABELS", description: "Comma-separated list of PR labels." },
    { name: "PR_AUTHOR", description: "Login of the PR author." },
    { name: "PR_STATE", description: "PR state (``open`` / ``closed``)." },
    {
      name: "PR_ACTION",
      description: "The webhook action (e.g. ``opened``, ``synchronize``).",
    },
    { name: "PR_BASE_REF", description: "Target branch name." },
    { name: "PR_HEAD_REF", description: "Source branch name." },
    {
      name: "PR_CONTENT",
      description: "Markdown block with the title + body.",
    },
    {
      name: "PR_COMMENTS",
      description: "Rendered thread of PR conversation comments.",
      runtimeOnly: true,
    },
    {
      name: "PR_REVIEW_COMMENTS",
      description: "Rendered thread of inline review comments.",
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
    },
    {
      name: "REVIEW_BODY",
      description: "Summary body of the review.",
    },
    {
      name: "REVIEW_AUTHOR",
      description: "Login of the reviewer.",
    },
    {
      name: "REVIEW_URL",
      description: "Permalink to the review.",
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
    },
    {
      name: "REVIEW_COMMENT_AUTHOR",
      description: "Login of the inline comment author.",
    },
    {
      name: "REVIEW_COMMENT_PATH",
      description: "Path of the file commented on.",
    },
    {
      name: "REVIEW_COMMENT_URL",
      description: "Permalink to the inline comment.",
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
    },
    {
      name: "PUSH_PUSHER",
      description: "Login of the user that pushed.",
    },
    {
      name: "PUSH_COMMIT_COUNT",
      description: "Number of commits in the push.",
    },
    {
      name: "PUSH_COMMITS",
      description: "Rendered list of commit messages.",
    },
  ],
}

export const VARIABLE_CATALOG: Record<
  AgentTemplateTriggerKind,
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
