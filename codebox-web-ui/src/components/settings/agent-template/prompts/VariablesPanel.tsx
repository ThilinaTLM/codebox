import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import {
  VARIABLE_CATALOG
  
} from "../variableCatalog"
import type {VariableEntry} from "../variableCatalog";
import type { AgentTemplateTriggerKind } from "@/net/http/types"
import { Badge } from "@/components/ui/badge"
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            v.description.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [groups, search])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Available variables</h4>
        <p className="text-[11px] text-muted-foreground">
          Click a variable to insert it at the cursor.
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
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No matches.</p>
        ) : (
          filtered.map((g) => (
            <div key={g.id} className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {g.title}
              </p>
              <ul className="space-y-1">
                {g.items.map((v) => (
                  <li key={v.name}>
                    <VariableButton
                      entry={v}
                      onInsert={() => onInsert(`\${{${v.name}}}`)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function VariableButton({
  entry,
  onInsert,
}: {
  entry: VariableEntry
  onInsert: () => void
}) {
  return (
    <button
      type="button"
      onClick={onInsert}
      title={entry.description}
      className="group/var flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted"
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
  )
}
