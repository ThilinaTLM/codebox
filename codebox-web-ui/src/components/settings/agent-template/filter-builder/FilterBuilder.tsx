import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon } from "@hugeicons/core-free-icons"
import { ALLOWED_FIELDS } from "../metadata"
import { FilterRow } from "./FilterRow"
import type {
  AgentTemplateFilterPredicate,
  AgentTemplateTriggerKind,
} from "@/net/http/types"
import { Button } from "@/components/ui/button"

interface FilterBuilderProps {
  triggerKind: AgentTemplateTriggerKind
  filters: Array<AgentTemplateFilterPredicate>
  errors?: Array<string | undefined>
  onAdd: () => void
  onUpdate: (index: number, patch: Partial<AgentTemplateFilterPredicate>) => void
  onRemove: (index: number) => void
  disabled?: boolean
}

export function FilterBuilder({
  triggerKind,
  filters,
  errors,
  onAdd,
  onUpdate,
  onRemove,
  disabled,
}: FilterBuilderProps) {
  const hasFields = Object.keys(ALLOWED_FIELDS[triggerKind]).length > 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h4 className="text-sm font-medium">Event filters</h4>
          <p className="text-xs text-muted-foreground">
            All filters must match (AND). Leave empty to match every event of
            this kind.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={disabled || !hasFields}
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Add filter
        </Button>
      </div>

      {filters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          No filters yet — every event of this kind will match.
        </div>
      ) : (
        <div className="space-y-2">
          {filters.map((pred, idx) => (
            <FilterRow
              // biome-ignore lint/suspicious/noArrayIndexKey: reducer keys are positional
              key={idx}
              triggerKind={triggerKind}
              predicate={pred}
              error={errors?.[idx]}
              onUpdate={(patch) => onUpdate(idx, patch)}
              onRemove={() => onRemove(idx)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}
