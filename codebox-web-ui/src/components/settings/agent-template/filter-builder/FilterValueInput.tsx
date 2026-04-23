import type { AgentTemplateFilterOp } from "@/net/http/types"
import type { FieldType } from "../metadata"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TagInput } from "@/components/ui/tag-input"
import { Badge } from "@/components/ui/badge"

interface FilterValueInputProps {
  fieldType: FieldType
  op: AgentTemplateFilterOp
  value: string | Array<string>
  onChange: (next: string | Array<string>) => void
  suggestions?: ReadonlyArray<string>
  disabled?: boolean
}

function isListValue(fieldType: FieldType, op: AgentTemplateFilterOp): boolean {
  if (op === "in" || op === "contains_any") return true
  if (fieldType === "list" && op === "eq") return true
  return false
}

export function FilterValueInput({
  fieldType,
  op,
  value,
  onChange,
  suggestions,
  disabled,
}: FilterValueInputProps) {
  const expectsList = isListValue(fieldType, op)

  // Bool + eq → Yes/No select
  if (fieldType === "bool" && op === "eq") {
    const stringValue = Array.isArray(value) ? "" : value
    return (
      <Select
        value={stringValue || "true"}
        onValueChange={(v) => v && onChange(v)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full" aria-label="Filter value">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Yes (true)</SelectItem>
          <SelectItem value="false">No (false)</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  // Regex input — monospace + badge hint
  if (op === "matches") {
    const stringValue = Array.isArray(value) ? value.join(",") : value
    return (
      <div className="relative">
        <Input
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label="Filter regex"
          placeholder="e.g. ^feature/.*"
          className="pr-16 font-mono text-xs"
        />
        <Badge
          variant="outline"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
        >
          regex
        </Badge>
      </div>
    )
  }

  // Tag input for list-shaped values
  if (expectsList) {
    const arr = Array.isArray(value)
      ? value
      : value
        ? value.split(",").map((s) => s.trim()).filter(Boolean)
        : []

    const normalize =
      fieldType === "int"
        ? (raw: string, current: ReadonlyArray<string>) => {
            const trimmed = raw.trim()
            if (!trimmed) return null
            if (!/^-?\d+$/.test(trimmed)) return null
            if (current.includes(trimmed)) return null
            return trimmed
          }
        : undefined

    return (
      <div className="space-y-1.5">
        <TagInput
          value={arr}
          onValueChange={onChange}
          placeholder={
            fieldType === "int"
              ? "Press Enter to add a number…"
              : "Press Enter to add a value…"
          }
          disabled={disabled}
          normalize={normalize}
          aria-label="Filter values"
        />
        {suggestions && suggestions.length > 0 && (
          <SuggestionChips
            values={arr}
            suggestions={suggestions}
            onAdd={(s) => onChange([...arr, s])}
            disabled={disabled}
          />
        )}
      </div>
    )
  }

  // Int + eq
  if (fieldType === "int") {
    const stringValue = Array.isArray(value) ? "" : value
    return (
      <Input
        type="number"
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Filter value"
      />
    )
  }

  // String + eq (and fallback)
  const stringValue = Array.isArray(value) ? value.join(",") : value
  return (
    <Input
      value={stringValue}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Filter value"
      placeholder="value"
    />
  )
}

function SuggestionChips({
  values,
  suggestions,
  onAdd,
  disabled,
}: {
  values: ReadonlyArray<string>
  suggestions: ReadonlyArray<string>
  onAdd: (s: string) => void
  disabled?: boolean
}) {
  const remaining = suggestions.filter((s) => !values.includes(s))
  if (remaining.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-[11px] text-muted-foreground">Suggestions:</span>
      {remaining.slice(0, 10).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onAdd(s)}
          disabled={disabled}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          + {s}
        </button>
      ))}
    </div>
  )
}
