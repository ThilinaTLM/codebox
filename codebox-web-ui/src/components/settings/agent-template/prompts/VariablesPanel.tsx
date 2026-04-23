import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import {
  VARIABLE_CATALOG,
  triggersExposing,
} from "../variableCatalog"
import { triggerKindMeta } from "../metadata"
import type { VariableEntry, VariableGroup } from "../variableCatalog"
import type { AgentTemplateTriggerKind } from "@/net/http/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface VariablesPanelProps {
  triggerKind: AgentTemplateTriggerKind
  onInsert: (token: string) => void
}

export function VariablesPanel({
  triggerKind,
  onInsert,
}: VariablesPanelProps) {
  const groups = VARIABLE_CATALOG[triggerKind]
  const [search, setSearch] = useState("")
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = groupFilter
      ? groups.filter((g) => g.id === groupFilter)
      : groups
    if (!q) return base
    return base
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            v.description.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [groups, search, groupFilter])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Available variables</h4>
        <p className="text-[11px] text-muted-foreground">
          Click a variable to insert it at the cursor. Expand for an
          example and where it's available.
        </p>
      </div>
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter variables…"
          className="h-8 pl-8 text-xs"
          aria-label="Filter variables"
        />
      </div>
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <GroupChip
            label="All"
            active={groupFilter === null}
            onClick={() => setGroupFilter(null)}
          />
          {groups.map((g) => (
            <GroupChip
              key={g.id}
              label={g.title}
              active={groupFilter === g.id}
              onClick={() =>
                setGroupFilter((current) => (current === g.id ? null : g.id))
              }
            />
          ))}
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No matches.</p>
        ) : (
          filtered.map((g) => (
            <VariableGroupBlock
              key={g.id}
              group={g}
              expandedName={expanded}
              onToggleExpanded={(name) =>
                setExpanded((current) => (current === name ? null : name))
              }
              onInsert={onInsert}
            />
          ))
        )}
      </div>
    </div>
  )
}

function GroupChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? "true" : undefined}
      className={cn(
        "rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors",
        "hover:border-border hover:bg-muted/40",
        "data-[active=true]:border-primary/50 data-[active=true]:bg-primary/10 data-[active=true]:text-primary",
      )}
    >
      {label}
    </button>
  )
}

function VariableGroupBlock({
  group,
  expandedName,
  onToggleExpanded,
  onInsert,
}: {
  group: VariableGroup
  expandedName: string | null
  onToggleExpanded: (name: string) => void
  onInsert: (token: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {group.title}
      </p>
      <ul className="space-y-0.5">
        {group.items.map((v) => (
          <li key={v.name}>
            <VariableRow
              entry={v}
              expanded={expandedName === v.name}
              onToggle={() => onToggleExpanded(v.name)}
              onInsert={() => onInsert(`\${{${v.name}}}`)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function VariableRow({
  entry,
  expanded,
  onToggle,
  onInsert,
}: {
  entry: VariableEntry
  expanded: boolean
  onToggle: () => void
  onInsert: () => void
}) {
  const availableFor = useMemo(
    () => triggersExposing(entry.name),
    [entry.name],
  )

  return (
    <div
      className={cn(
        "rounded-md border border-transparent transition-colors",
        expanded && "border-border/60 bg-background",
      )}
    >
      <div className="group/var flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`Toggle details for ${entry.name}`}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className={cn(
              "size-3 transition-transform",
              expanded && "rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          onClick={onInsert}
          title={`Insert \${{${entry.name}}}`}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded px-1 py-1 text-left"
        >
          <span className="flex w-full items-center gap-1.5">
            <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground group-hover/var:bg-background">
              {entry.name}
            </code>
            {entry.runtimeOnly && (
              <Badge
                variant="outline"
                className="ml-auto shrink-0 text-[9px] uppercase tracking-wider"
              >
                runtime
              </Badge>
            )}
          </span>
          <span className="line-clamp-2 text-[11px] text-muted-foreground">
            {entry.description}
          </span>
        </button>
      </div>
      {expanded && (
        <div className="space-y-2 border-t border-border/60 px-2 py-2 text-[11px] text-muted-foreground">
          {entry.notes && (
            <p className="leading-relaxed">{entry.notes}</p>
          )}
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider">
              Example
            </p>
            <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[10.5px] leading-snug text-foreground">
              {entry.example}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider">
              Available for
            </p>
            <div className="flex flex-wrap gap-1">
              {availableFor.map((kind) => (
                <Badge
                  key={kind}
                  variant="secondary"
                  className="text-[10px] font-normal"
                >
                  {triggerKindMeta(kind).title}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end pt-1">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onInsert}
            >
              Insert at cursor
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
