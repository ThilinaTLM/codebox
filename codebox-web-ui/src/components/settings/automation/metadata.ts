/**
 * Static metadata for the automation form UI.
 *
 * ``ALLOWED_FIELDS``, ``VALID_ACTIONS``, and ``OPS_BY_TYPE`` mirror
 * ``codebox-orchestrator/src/codebox_orchestrator/automation/application/allowed_fields.py``.
 * Keep these tables in sync when the backend adds / removes fields.
 *
 * Note: ``repo`` and ``action`` are **not** filter fields. Repo is
 * structural (``Automation.trigger_repo``) and action is structural
 * (``Automation.trigger_actions``). Both live outside the predicate
 * builder.
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
    description:
      "Runs on the issue actions you select (opened, labeled, closed, …).",
    icon: Bug01Icon,
    group: "github",
    eventType: "issues",
  },
  {
    value: "github.issue_comment",
    title: "Issue Comment",
    description:
      "Runs on the comment actions you select (created, edited, deleted).",
    icon: Comment01Icon,
    group: "github",
    eventType: "issue_comment",
  },
  {
    value: "github.pull_request",
    title: "Pull Request",
    description:
      "Runs on the PR actions you select (opened, synchronize, ready_for_review, …).",
    icon: GitPullRequestIcon,
    group: "github",
    eventType: "pull_request",
  },
  {
    value: "github.pull_request_review",
    title: "PR Review",
    description:
      "Runs on the review actions you select (submitted, edited, dismissed).",
    icon: Message01Icon,
    group: "github",
    eventType: "pull_request_review",
  },
  {
    value: "github.pull_request_review_comment",
    title: "PR Review Comment",
    description:
      "Runs on the review-comment actions you select (created, edited, deleted).",
    icon: MessageMultiple01Icon,
    group: "github",
    eventType: "pull_request_review_comment",
  },
  {
    value: "github.push",
    title: "Push",
    description: "Runs on pushes to any branch or tag of the target repo.",
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
    labels: "list",
    author: "string",
    title: "string",
  },
  "github.issue_comment": {
    labels: "list",
    author: "string",
    comment_author: "string",
    comment_body: "string",
    is_pr: "bool",
  },
  "github.pull_request": {
    labels: "list",
    author: "string",
    title: "string",
    base_ref: "string",
    head_ref: "string",
    draft: "bool",
  },
  "github.pull_request_review": {
    author: "string",
    review_state: "string",
    review_body: "string",
  },
  "github.pull_request_review_comment": {
    pr_author: "string",
    comment_author: "string",
    comment_body: "string",
  },
  "github.push": {
    branch: "string",
    tag: "string",
    pusher: "string",
    commit_count: "int",
    forced: "bool",
    created: "bool",
    deleted: "bool",
  },
  schedule: {},
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
  labels: "Labels",
  author: "Author",
  pr_author: "PR author",
  title: "Title",
  comment_author: "Comment author",
  comment_body: "Comment body",
  is_pr: "On pull request",
  base_ref: "Base branch",
  head_ref: "Head branch",
  draft: "Draft",
  review_state: "Review state",
  review_body: "Review body",
  pusher: "Pusher",
  commit_count: "Commit count",
  branch: "Branch",
  tag: "Tag",
  forced: "Forced push",
  created: "Branch/tag created",
  deleted: "Branch/tag deleted",
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

// ── Valid actions + defaults per trigger kind ──────────────

/**
 * Valid GitHub action strings per trigger kind. Non-empty sets indicate
 * that the kind requires a non-empty ``trigger_actions`` selection.
 * ``github.push`` and ``schedule`` have no action field and stay empty.
 * Ordering reflects how commonly users need each chip.
 */
export const VALID_ACTIONS: Record<
  AutomationTriggerKind,
  ReadonlyArray<string>
> = {
  "github.issues": [
    "opened",
    "reopened",
    "edited",
    "labeled",
    "unlabeled",
    "closed",
    "assigned",
    "unassigned",
    "pinned",
    "unpinned",
  ],
  "github.issue_comment": ["created", "edited", "deleted"],
  "github.pull_request": [
    "opened",
    "synchronize",
    "ready_for_review",
    "reopened",
    "edited",
    "labeled",
    "unlabeled",
    "closed",
    "review_requested",
    "review_request_removed",
  ],
  "github.pull_request_review": ["submitted", "edited", "dismissed"],
  "github.pull_request_review_comment": ["created", "edited", "deleted"],
  "github.push": [],
  schedule: [],
}

/** Per-kind default actions seeded when the user picks a trigger kind. */
export const DEFAULT_ACTIONS: Record<
  AutomationTriggerKind,
  ReadonlyArray<string>
> = {
  "github.issues": ["opened", "reopened"],
  "github.issue_comment": ["created"],
  "github.pull_request": ["opened", "synchronize", "ready_for_review"],
  "github.pull_request_review": ["submitted"],
  "github.pull_request_review_comment": ["created"],
  "github.push": [],
  schedule: [],
}

export function triggerKindHasActions(kind: AutomationTriggerKind): boolean {
  return VALID_ACTIONS[kind].length > 0
}

/**
 * Suggestions for filter fields with a known finite set of values. Used
 * by ``FilterValueInput`` to surface quick-add chips next to the tag
 * input. Empty for every kind that has no finite-value filter field.
 */
export const KNOWN_VALUES: Record<
  AutomationTriggerKind,
  Partial<Record<string, ReadonlyArray<string>>>
> = {
  "github.issues": {},
  "github.issue_comment": {},
  "github.pull_request": {},
  "github.pull_request_review": {
    review_state: ["approved", "changes_requested", "commented"],
  },
  "github.pull_request_review_comment": {},
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
    // The backend rejects this mode for PR-family triggers (no issue
    // context) and for ``github.push``. Keep UI and backend aligned.
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
      "Always work on a fixed branch of the target repo. Required for scheduled automations.",
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

/**
 * The workspace mode seeded when the user picks *kind*. Users can override
 * it via the advanced disclosure in the trigger step.
 */
export function defaultWorkspaceModeFor(
  kind: AutomationTriggerKind
): AutomationWorkspaceMode {
  switch (kind) {
    case "schedule":
      return "pinned"
    case "github.issues":
    case "github.issue_comment":
      return "branch_from_issue"
    default:
      return "checkout_ref"
  }
}
