import { VALID_ACTIONS } from "../metadata"
import type { AutomationTriggerKind } from "@/net/http/types"
import { cn } from "@/lib/utils"

interface ActionChipMultiSelectProps {
  triggerKind: AutomationTriggerKind
  value: Array<string>
  onToggle: (action: string) => void
  disabled?: boolean
  error?: string
}

/**
 * Required chip multi-select for the trigger's action set. Renders nothing
 * for trigger kinds that carry no ``action`` field (``github.push`` and
 * ``schedule``). Otherwise every valid action for the kind is rendered as
 * a toggle chip.
 */
export function ActionChipMultiSelect({
  triggerKind,
  value,
  onToggle,
  disabled,
  error,
}: ActionChipMultiSelectProps) {
  const actions = VALID_ACTIONS[triggerKind]
  if (actions.length === 0) return null

  const selected = new Set(value)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Actions">
        {actions.map((action) => {
          const isOn = selected.has(action)
          return (
            <button
              key={action}
              type="button"
              onClick={() => onToggle(action)}
              disabled={disabled}
              aria-pressed={isOn}
              data-selected={isOn ? "true" : undefined}
              className={cn(
                "group/chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all outline-none",
                "border-border/60 bg-background text-muted-foreground",
                "hover:border-border hover:bg-muted/40 hover:text-foreground",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "data-[selected=true]:border-primary data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-block size-2 rounded-full bg-muted-foreground/40 transition-colors",
                  "group-data-[selected=true]/chip:bg-primary"
                )}
              />
              {action}
            </button>
          )
        })}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
