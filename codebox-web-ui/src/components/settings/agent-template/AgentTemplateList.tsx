import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { EmptyTemplatesState } from "./EmptyTemplatesState"
import { TemplateListRow } from "./TemplateListRow"
import { SectionSkeleton } from "@/components/settings/SectionSkeleton"
import { useAgentTemplates } from "@/net/query"
import { Button } from "@/components/ui/button"

interface AgentTemplateListProps {
  projectSlug: string
  readOnly?: boolean
}

export function AgentTemplateList({
  projectSlug,
  readOnly = false,
}: AgentTemplateListProps) {
  const { data: templates = [], isLoading } = useAgentTemplates(projectSlug)

  if (isLoading) {
    return <SectionSkeleton />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Agent Templates</h2>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Spawn agents automatically from GitHub events or on a schedule.
          </p>
        </div>
        {!readOnly && (
          <Button
            size="sm"
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
            Create template
          </Button>
        )}
      </div>

      {templates.length === 0 ? (
        <EmptyTemplatesState projectSlug={projectSlug} readOnly={readOnly} />
      ) : (
        <ul className="space-y-2">
          {templates.map((tpl) => (
            <TemplateListRow
              key={tpl.id}
              projectSlug={projectSlug}
              template={tpl}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
