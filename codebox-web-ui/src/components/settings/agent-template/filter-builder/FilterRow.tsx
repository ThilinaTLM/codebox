import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon } from "@hugeicons/core-free-icons"
import {
  ALLOWED_FIELDS,
  KNOWN_VALUES,
  OPS_BY_TYPE,
  OP_HINTS,
  OP_LABELS,
  fieldLabel,
  fieldTypeBadge,
} from "../metadata"
import { FilterValueInput } from "./FilterValueInput"
import type { FieldType } from "../metadata"
import type {
  AgentTemplateFilterOp,
  AgentTemplateFilterPredicate,
  AgentTemplateTriggerKind,
} from "@/net/http/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface FilterRowProps {
  triggerKind: AgentTemplateTriggerKind
  predicate: AgentTemplateFilterPredicate
  error?: string
  onUpdate: (patch: Partial<AgentTemplateFilterPredicate>) => void
  onRemove: () => void
  disabled?: boolean
}

export function FilterRow({
  triggerKind,
  predicate,
  error,
  onUpdate,
  onRemove,
  disabled,
}: FilterRowProps) {
  const fields = ALLOWED_FIELDS[triggerKind]
  const fieldType: FieldType = fields[predicate.field] ?? "string"
  const availableOps = OPS_BY_TYPE[fieldType]
  const suggestions = KNOWN_VALUES[triggerKind][predicate.field]

  const handleFieldChange = (newField: string) => {
    const newType: FieldType = fields[newField] ?? "string"
    const newAvailableOps = OPS_BY_TYPE[newType]
    const newOp: AgentTemplateFilterOp = newAvailableOps.includes(
      predicate.op
    )
      ? predicate.op
      : newAvailableOps[0]
    const listy =
      newOp === "in" || newOp === "contains_any" || newType === "list"
    onUpdate({
      field: newField,
      op: newOp,
      value: listy ? [] : newType === "bool" ? "true" : "",
    })
  }

  const handleOpChange = (newOp: AgentTemplateFilterOp) => {
    const listy =
      newOp === "in" || newOp === "contains_any" || fieldType === "list"
    let nextValue: string | Array<string>
    if (listy) {
      nextValue = Array.isArray(predicate.value)
        ? predicate.value
        : predicate.value
          ? [predicate.value]
          : []
    } else {
      nextValue = Array.isArray(predicate.value)
        ? predicate.value.join(",")
        : predicate.value
    }
    onUpdate({ op: newOp, value: nextValue })
  }

  return (
    <div
      data-slot="filter-row"
      className="rounded-xl border border-border/60 bg-muted/20 p-3"
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(160px,1fr)_minmax(140px,1fr)_minmax(200px,2fr)_auto]">
        <div className="space-y-1">
          <Select
            value={predicate.field}
            onValueChange={(v) => v && handleFieldChange(v)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full" aria-label="Filter field">
              <SelectValue>
                <span>{fieldLabel(predicate.field)}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fields).map(([f, ft]) => (
                <SelectItem key={f} value={f}>
                  <span className="flex-1">{fieldLabel(f)}</span>
                  <Badge
                    variant="outline"
                    className="ml-auto shrink-0 text-[10px]"
                  >
                    {fieldTypeBadge(ft)}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Select
            value={predicate.op}
            onValueChange={(v) => v && handleOpChange(v as AgentTemplateFilterOp)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full" aria-label="Filter operator">
              <SelectValue>{OP_LABELS[predicate.op]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableOps.map((op) => (
                <SelectItem key={op} value={op}>
                  <span>{OP_LABELS[op]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground/80">
            {OP_HINTS[predicate.op]}
          </p>
        </div>

        <div className="space-y-1">
          <FilterValueInput
            fieldType={fieldType}
            op={predicate.op}
            value={predicate.value}
            onChange={(next) => onUpdate({ value: next })}
            suggestions={suggestions}
            disabled={disabled}
          />
          {error && (
            <p className="text-[11px] text-destructive">{error}</p>
          )}
        </div>

        <div className="flex items-start">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove filter"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>
    </div>
  )
}
