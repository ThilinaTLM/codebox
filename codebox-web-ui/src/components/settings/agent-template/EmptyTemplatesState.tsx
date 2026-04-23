import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Bug01Icon,
  Calendar03Icon,
  GitPullRequestIcon,
  PlusSignIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"

interface EmptyTemplatesStateProps {
  projectSlug: string
  readOnly: boolean
}

const EXAMPLES = [
  {
    icon: Bug01Icon,
    title: "Triage new issues",
    description:
      "Read new issues and apply the right labels, assignee, and milestone.",
  },
  {
    icon: GitPullRequestIcon,
    title: "Review pull requests",
    description:
      "Summarise changes and leave inline comments when a PR opens.",
  },
  {
    icon: Calendar03Icon,
    title: "Daily standup digest",
    description:
      "Post a daily summary of overnight activity to a tracking issue.",
  },
]

export function EmptyTemplatesState({
  projectSlug,
  readOnly,
}: EmptyTemplatesStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-8">
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className="size-5" />
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-lg">No agent templates yet</h3>
          <p className="text-sm text-muted-foreground">
            Templates let you spawn agents automatically from GitHub events or
            on a schedule. Here are a few ideas.
          </p>
        </div>
        <ul className="grid gap-3 text-left sm:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <li
              key={ex.title}
              className="rounded-xl border border-border/50 bg-background/80 p-4"
            >
              <HugeiconsIcon
                icon={ex.icon}
                strokeWidth={2}
                className="size-4 text-muted-foreground"
              />
              <p className="mt-2 text-sm font-medium">{ex.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ex.description}
              </p>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <Button
            render={
              <Link
                to="/projects/$projectSlug/configs/agent-templates/new"
                params={{ projectSlug }}
              />
            }
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Create your first template
          </Button>
        )}
      </div>
    </div>
  )
}
