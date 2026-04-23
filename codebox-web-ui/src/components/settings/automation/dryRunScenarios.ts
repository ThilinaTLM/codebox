/**
 * Prebuilt webhook payload presets for the dry-run panel.
 *
 * These mimic realistic GitHub webhook payloads and are meant to be good
 * enough for filter matching + prompt rendering. They do NOT need to be
 * byte-equivalent to the real webhooks; the backend's context builders
 * tolerate missing fields.
 */

import type { AutomationTriggerKind } from "@/net/http/types"

export interface DryRunScenario {
  id: string
  label: string
  description: string
  payload: Record<string, unknown>
}

const REPO = {
  full_name: "my-org/my-repo",
  name: "my-repo",
  html_url: "https://github.com/my-org/my-repo",
  default_branch: "main",
}

const AUTHOR = { login: "octocat" }

const ISSUE = (overrides: Record<string, unknown> = {}) => ({
  number: 42,
  title: "Example issue title",
  body: "Example issue body.\n\nSteps to reproduce:\n1. ...",
  html_url: "https://github.com/my-org/my-repo/issues/42",
  state: "open",
  user: AUTHOR,
  labels: [],
  ...overrides,
})

const PR = (overrides: Record<string, unknown> = {}) => ({
  number: 17,
  title: "Example pull request",
  body: "This PR does X, Y and Z.",
  html_url: "https://github.com/my-org/my-repo/pull/17",
  state: "open",
  draft: false,
  user: AUTHOR,
  labels: [],
  base: { ref: "main" },
  head: { ref: "feature/example" },
  ...overrides,
})

export const DRY_RUN_SCENARIOS: Record<
  AutomationTriggerKind,
  ReadonlyArray<DryRunScenario>
> = {
  "github.issues": [
    {
      id: "opened",
      label: "Issue opened",
      description: "A brand-new issue is filed.",
      payload: {
        action: "opened",
        issue: ISSUE(),
        repository: REPO,
      },
    },
    {
      id: "labeled-bug",
      label: "Issue labeled 'bug'",
      description: "An existing issue is tagged with the ``bug`` label.",
      payload: {
        action: "labeled",
        issue: ISSUE({ labels: [{ name: "bug" }] }),
        label: { name: "bug" },
        repository: REPO,
      },
    },
    {
      id: "closed",
      label: "Issue closed",
      description: "An issue is closed (resolved or not planned).",
      payload: {
        action: "closed",
        issue: ISSUE({ state: "closed" }),
        repository: REPO,
      },
    },
  ],
  "github.issue_comment": [
    {
      id: "created-issue",
      label: "New comment on issue",
      description: "A user comments on an existing issue.",
      payload: {
        action: "created",
        issue: ISSUE(),
        comment: {
          body: "Can someone take a look at this?",
          user: AUTHOR,
          html_url: "https://github.com/my-org/my-repo/issues/42#comment-1",
        },
        repository: REPO,
      },
    },
    {
      id: "created-pr",
      label: "New comment on PR",
      description: "A comment is posted on a pull request's conversation tab.",
      payload: {
        action: "created",
        issue: { ...ISSUE(), pull_request: { url: "…" } },
        comment: {
          body: "/review please",
          user: AUTHOR,
          html_url: "https://github.com/my-org/my-repo/pull/17#comment-1",
        },
        repository: REPO,
      },
    },
  ],
  "github.pull_request": [
    {
      id: "opened",
      label: "PR opened",
      description: "A pull request is opened.",
      payload: { action: "opened", pull_request: PR(), repository: REPO },
    },
    {
      id: "ready-for-review",
      label: "PR ready for review",
      description: "A draft PR is marked ready for review.",
      payload: {
        action: "ready_for_review",
        pull_request: PR({ draft: false }),
        repository: REPO,
      },
    },
    {
      id: "synchronize",
      label: "PR updated (new commits)",
      description: "New commits were pushed to the PR branch.",
      payload: { action: "synchronize", pull_request: PR(), repository: REPO },
    },
  ],
  "github.pull_request_review": [
    {
      id: "approved",
      label: "Review approved",
      description: "A reviewer approved the PR.",
      payload: {
        action: "submitted",
        review: {
          state: "approved",
          body: "LGTM — nice work!",
          user: AUTHOR,
          html_url: "https://github.com/my-org/my-repo/pull/17#review-1",
        },
        pull_request: PR(),
        repository: REPO,
      },
    },
    {
      id: "changes-requested",
      label: "Changes requested",
      description: "A reviewer requested changes.",
      payload: {
        action: "submitted",
        review: {
          state: "changes_requested",
          body: "Please address the comments below.",
          user: AUTHOR,
          html_url: "https://github.com/my-org/my-repo/pull/17#review-2",
        },
        pull_request: PR(),
        repository: REPO,
      },
    },
  ],
  "github.pull_request_review_comment": [
    {
      id: "created",
      label: "Inline review comment",
      description: "A reviewer left an inline comment on a file.",
      payload: {
        action: "created",
        comment: {
          body: "This line can panic when ``x`` is null.",
          user: AUTHOR,
          path: "src/lib/example.ts",
          html_url:
            "https://github.com/my-org/my-repo/pull/17#discussion_r1",
        },
        pull_request: PR(),
        repository: REPO,
      },
    },
  ],
  "github.push": [
    {
      id: "push-main",
      label: "Push to main",
      description: "A single commit pushed to the main branch.",
      payload: {
        ref: "refs/heads/main",
        pusher: { name: "octocat" },
        commits: [
          {
            id: "abc123",
            message: "Fix: handle null in example",
            author: { name: "octocat" },
          },
        ],
        repository: REPO,
      },
    },
  ],
  schedule: [],
}

export function scenariosFor(
  kind: AutomationTriggerKind
): ReadonlyArray<DryRunScenario> {
  return DRY_RUN_SCENARIOS[kind]
}
