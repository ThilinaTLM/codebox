/**
 * Static metadata for the automation form UI.
 *
 * ``ALLOWED_FIELDS`` and ``OPS_BY_TYPE`` mirror
 * ``codebox-orchestrator/src/codebox_orchestrator/automation/application/allowed_fields.py``.
 * Keep these tables in sync when the backend adds / removes fields.
 */

import {
  Bug01Icon,
  Calendar03Icon,
  Clock02Icon,
  Comment01Icon,
  GitCommitIcon,
  GitPullRequestIcon,
  Github01Icon,
  Message01Icon,
  MessageMultiple01Icon,
} from "@hugeicons/core-free-icons"
import type {
  AutomationFilterOp,
  AutomationTriggerKind,
  AutomationWorkspaceMode,
} from "@/net/http/types"

type HugeIcon = typeof Clock02Icon

// ── Trigger kinds ───────────────────────────────────────────

export interface TriggerKindMeta {
  value: AutomationTriggerKind
  title: string
  description: string
  icon: HugeIcon
  group: "github" | "schedule"
  /** GitHub webhook event name (without the ``github.`` prefix). */
  eventType: string | null
}

export const TRIGGER_KINDS: ReadonlyArray<TriggerKindMeta> = [
  {
    value: "github.issues",
    title: "Issue",
    description: "Runs when an issue is opened, labeled, closed, …",
    icon: Bug01Icon,
    group: "github",
    eventType: "issues",
  },
  {
    value: "github.issue_comment",
    title: "Issue Comment",
    description: "Runs on new comments on issues or pull requests.",
    icon: Comment01Icon,
    group: "github",
    eventType: "issue_comment",
  },
  {
    value: "github.pull_request",
    title: "Pull Request",
    description: "Runs when a PR is opened, synchronized, merged, …",
    icon: GitPullRequestIcon,
    group: "github",
    eventType: "pull_request",
  },
  {
    value: "github.pull_request_review",
    title: "PR Review",
    description: "Runs when a PR review is submitted.",
    icon: Message01Icon,
    group: "github",
    eventType: "pull_request_review",
  },
  {
    value: "github.pull_request_review_comment",
    title: "PR Review Comment",
    description: "Runs on inline review comments inside a PR.",
    icon: MessageMultiple01Icon,
    group: "github",
    eventType: "pull_request_review_comment",
  },
  {
    value: "github.push",
    title: "Push",
    description: "Runs on pushes to any branch or tag.",
    icon: GitCommitIcon,
    group: "github",
    eventType: "push",
  },
  {
    value: "schedule",
    title: "Schedule",
    description: "Runs on a cron schedule, independent of GitHub events.",
    icon: Calendar03Icon,
    group: "schedule",
    eventType: null,
  },
] as const

export function triggerKindMeta(kind: AutomationTriggerKind): TriggerKindMeta {
  return TRIGGER_KINDS.find((t) => t.value === kind) ?? TRIGGER_KINDS[0]
}

export function triggerIcon(kind: AutomationTriggerKind): HugeIcon {
  if (kind === "schedule") return Clock02Icon
  return Github01Icon
}

// ── Filter fields ───────────────────────────────────────────

export type FieldType = "string" | "list" | "bool" | "int"

export const ALLOWED_FIELDS: Record<
  AutomationTriggerKind,
  Record<string, FieldType>
> = {
  "github.issues": {
    repo: "string",
    action: "string",
    labels: "list",
    author: "string",
    title: "string",
    state: "string",
  },
  "github.issue_comment": {
    repo: "string",
    action: "string",
    labels: "list",
    author: "string",
    comment_author: "string",
    comment_body: "string",
    is_pr: "bool",
  },
  "github.pull_request": {
    repo: "string",
    action: "string",
    labels: "list",
    author: "string",
    title: "string",
    base_ref: "string",
    head_ref: "string",
    draft: "bool",
  },
  "github.pull_request_review": {
    repo: "string",
    action: "string",
    author: "string",
    review_state: "string",
    review_body: "string",
  },
  "github.pull_request_review_comment": {
    repo: "string",
    action: "string",
    author: "string",
    comment_author: "string",
    comment_body: "string",
  },
  "github.push": {
    repo: "string",
    ref: "string",
    pusher: "string",
    commit_count: "int",
  },
  schedule: { repo: "string" },
}

// ── Filter ops ──────────────────────────────────────────────

export const OPS_BY_TYPE: Record<FieldType, Array<AutomationFilterOp>> = {
  string: ["eq", "in", "matches"],
  list: ["eq", "in", "contains_any", "matches"],
  bool: ["eq"],
  int: ["eq", "in"],
}

export const OP_LABELS: Record<AutomationFilterOp, string> = {
  eq: "equals",
  in: "is one of",
  contains_any: "contains any of",
  matches: "matches regex",
}

export const OP_HINTS: Record<AutomationFilterOp, string> = {
  eq: "Exact match against the field value.",
  in: "Matches when the value is any one of the entries.",
  contains_any: "Matches when at least one entry is present in the list.",
  matches: "Matches when the value matches this regular expression.",
}

// ── Field labels ────────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  repo: "Repository",
  action: "Action",
  labels: "Labels",
  author: "Author",
  title: "Title",
  state: "State",
  comment_author: "Comment author",
  comment_body: "Comment body",
  is_pr: "On pull request",
  base_ref: "Base branch",
  head_ref: "Head branch",
  draft: "Draft",
  review_state: "Review state",
  review_body: "Review body",
  ref: "Git ref",
  pusher: "Pusher",
  commit_count: "Commit count",
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

export function fieldTypeBadge(type: FieldType): string {
  switch (type) {
    case "string":
      return "text"
    case "list":
      return "list"
    case "bool":
      return "yes/no"
    case "int":
      return "number"
  }
}

// ── Known values per field ──────────────────────────────────

/**
 * Suggestions for fields with a known finite set of values. Used by
 * ``FilterValueInput`` to surface quick-add chips next to the tag input.
 */
export const KNOWN_VALUES: Record<
  AutomationTriggerKind,
  Partial<Record<string, ReadonlyArray<string>>>
> = {
  "github.issues": {
    action: [
      "opened",
      "closed",
      "reopened",
      "edited",
      "labeled",
      "unlabeled",
      "assigned",
      "unassigned",
      "pinned",
      "unpinned",
    ],
    state: ["open", "closed"],
  },
  "github.issue_comment": {
    action: ["created", "edited", "deleted"],
  },
  "github.pull_request": {
    action: [
      "opened",
      "closed",
      "reopened",
      "edited",
      "ready_for_review",
      "synchronize",
      "labeled",
      "unlabeled",
      "review_requested",
      "review_request_removed",
    ],
  },
  "github.pull_request_review": {
    action: ["submitted", "edited", "dismissed"],
    review_state: ["approved", "changes_requested", "commented"],
  },
  "github.pull_request_review_comment": {
    action: ["created", "edited", "deleted"],
  },
  "github.push": {},
  schedule: {},
}

// ── Workspace modes ─────────────────────────────────────────

export interface WorkspaceModeMeta {
  value: AutomationWorkspaceMode
  title: string
  description: string
  availableWhen: (kind: AutomationTriggerKind) => boolean
}

export const WORKSPACE_MODES: ReadonlyArray<WorkspaceModeMeta> = [
  {
    value: "branch_from_issue",
    title: "Branch from issue",
    description:
      "Create a fresh branch (named after the issue) for each matching event. Best for agents that open pull requests.",
    availableWhen: (kind) =>
      kind === "github.issues" || kind === "github.issue_comment",
  },
  {
    value: "checkout_ref",
    title: "Checkout the event ref",
    description:
      "Use the branch / ref carried by the event (PR head, pushed ref, comment source). Best for reviewing existing work.",
    availableWhen: (kind) => kind !== "schedule",
  },
  {
    value: "pinned",
    title: "Pinned branch",
    description:
      "Always work on a fixed repository + branch. Required for scheduled automations.",
    availableWhen: () => true,
  },
] as const

export function workspaceModeMeta(
  value: AutomationWorkspaceMode
): WorkspaceModeMeta {
  return WORKSPACE_MODES.find((m) => m.value === value) ?? WORKSPACE_MODES[0]
}

export function availableWorkspaceModes(
  kind: AutomationTriggerKind
): ReadonlyArray<WorkspaceModeMeta> {
  if (kind === "schedule") {
    return WORKSPACE_MODES.filter((m) => m.value === "pinned")
  }
  return WORKSPACE_MODES.filter((m) => m.availableWhen(kind))
}
