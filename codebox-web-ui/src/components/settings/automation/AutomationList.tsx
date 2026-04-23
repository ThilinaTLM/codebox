import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { EmptyAutomationsState } from "./EmptyAutomationsState"
import { AutomationListRow } from "./AutomationListRow"
import { SectionSkeleton } from "@/components/settings/SectionSkeleton"
import { useAutomations, useGitHubStatus } from "@/net/query"
import { Button } from "@/components/ui/button"

interface AutomationListProps {
  projectSlug: string
  readOnly?: boolean
}

export function AutomationList({
  projectSlug,
  readOnly = false,
}: AutomationListProps) {
  const { data: automations = [], isLoading } = useAutomations(projectSlug)
  const { data: ghStatus } = useGitHubStatus(projectSlug)
  const githubConfigured = Boolean(ghStatus?.enabled)

  if (isLoading) {
    return <SectionSkeleton />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Automations</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Spawn agents automatically from GitHub events or on a schedule.
          </p>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            nativeButton={false}
            render={
              <Link
                to="/projects/$projectSlug/configs/automations/new"
                params={{ projectSlug }}
              />
            }
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Create automation
          </Button>
        )}
      </div>

      {automations.length === 0 ? (
        <EmptyAutomationsState projectSlug={projectSlug} readOnly={readOnly} />
      ) : (
        <ul className="space-y-2">
          {automations.map((automation) => (
            <AutomationListRow
              key={automation.id}
              projectSlug={projectSlug}
              automation={automation}
              readOnly={readOnly}
              githubConfigured={githubConfigured}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
