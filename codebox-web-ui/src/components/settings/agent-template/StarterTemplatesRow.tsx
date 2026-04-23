import { HugeiconsIcon } from "@hugeicons/react"
import {
  Bug01Icon,
  Calendar03Icon,
  GitPullRequestIcon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons"
import { DEFAULT_SYSTEM_PROMPT } from "./prompts/defaultPrompts"
import type { Dispatch } from "react"
import type { FormAction, FormState } from "./useAgentTemplateFormState"
import type {
  AgentTemplateTriggerKind,
  AgentTemplateWorkspaceMode,
} from "@/net/http/types"
import { cn } from "@/lib/utils"

type HugeIcon = typeof Calendar03Icon

interface StarterTemplate {
  id: string
  title: string
  description: string
  icon: HugeIcon
  patch: Partial<FormState>
}

const STARTERS: ReadonlyArray<StarterTemplate> = [
  {
    id: "triage-issues",
    title: "Triage new issues",
    description:
      "Reviews newly opened issues and proposes labels, priority, and next steps.",
    icon: Bug01Icon,
    patch: {
      name: "Triage new issues",
      description:
        "Runs on newly opened issues and drafts a triage plan (labels, priority, next steps).",
      trigger_kind: "github.issues" as AgentTemplateTriggerKind,
      trigger_filters: [{ field: "action", op: "in", value: ["opened"] }],
      workspace_mode: "branch_from_issue" as AgentTemplateWorkspaceMode,
      system_prompt: DEFAULT_SYSTEM_PROMPT,
      initial_prompt:
        "A new issue was just opened on ${{REPO_FULL_NAME}}.\n\n" +
        "Read the issue, propose a triage plan (labels, priority, next " +
        "steps), and leave a short comment summarising your proposal.\n\n" +
        "Issue:\n${{ISSUE_CONTENT}}",
    },
  },
  {
    id: "review-prs",
    title: "Review pull requests",
    description:
      "Runs on opened / updated PRs, reviews the diff, and leaves actionable feedback.",
    icon: GitPullRequestIcon,
    patch: {
      name: "Review pull requests",
      description:
        "Reviews pull requests when they are opened, updated, or marked ready for review.",
      trigger_kind: "github.pull_request" as AgentTemplateTriggerKind,
      trigger_filters: [
        {
          field: "action",
          op: "in",
          value: ["opened", "synchronize", "ready_for_review"],
        },
      ],
      workspace_mode: "checkout_ref" as AgentTemplateWorkspaceMode,
      system_prompt: DEFAULT_SYSTEM_PROMPT,
      initial_prompt:
        "A pull request is ready for review on ${{REPO_FULL_NAME}} " +
        "(${{PR_HEAD_REF}} → ${{PR_BASE_REF}}).\n\n" +
        "Review the changes, call out risks, and suggest concrete " +
        "improvements. Keep your review focused and actionable.\n\n" +
        "PR:\n${{PR_CONTENT}}",
    },
  },
  {
    id: "daily-digest",
    title: "Daily project digest",
    description:
      "Runs every morning, summarises activity on the main branch, and posts a digest.",
    icon: Calendar03Icon,
    patch: {
      name: "Daily project digest",
      description:
        "Summarises project activity every weekday morning.",
      trigger_kind: "schedule" as AgentTemplateTriggerKind,
      trigger_filters: [],
      schedule_cron: "0 9 * * 1-5",
      schedule_timezone: "UTC",
      workspace_mode: "pinned" as AgentTemplateWorkspaceMode,
      system_prompt: DEFAULT_SYSTEM_PROMPT,
      initial_prompt:
        "It's 09:00 — time for the daily digest on ${{REPO_FULL_NAME}}.\n\n" +
        "Review recent commits, open issues, and open pull requests, " +
        "and produce a short standup-style summary of what moved, " +
        "what's blocked, and what needs attention today.",
    },
  },
  {
    id: "blank",
    title: "Start from scratch",
    description: "Keep the form empty and configure every field yourself.",
    icon: PencilEdit01Icon,
    patch: {},
  },
]

interface StarterTemplatesRowProps {
  dispatch: Dispatch<FormAction>
  disabled?: boolean
}

export function StarterTemplatesRow({
  dispatch,
  disabled,
}: StarterTemplatesRowProps) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <h4 className="text-sm font-medium">Start from a template</h4>
        <p className="text-xs text-muted-foreground">
          Pick a starting point, then tweak as needed. You can change
          anything later.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STARTERS.map((starter) => (
          <button
            key={starter.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (Object.keys(starter.patch).length === 0) return
              dispatch({ type: "set", patch: starter.patch })
            }}
            className={cn(
              "group/starter flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-background p-3 text-left transition-all outline-none",
              "hover:border-border hover:bg-muted/30",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover/starter:bg-primary/10 group-hover/starter:text-primary">
              <HugeiconsIcon
                icon={starter.icon}
                strokeWidth={2}
                className="size-4"
              />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{starter.title}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {starter.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
