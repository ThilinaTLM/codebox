import { Switch } from "@/components/ui/switch"

const NUM_INPUT_CLS =
  "h-8 w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground tabular-nums outline-none duration-fast focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" as const

interface ToolConfigRowProps {
  label: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children?: React.ReactNode
}

export function ToolConfigRow({
  label,
  enabled,
  onToggle,
  children,
}: ToolConfigRowProps) {
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <Switch checked={enabled} onCheckedChange={onToggle} size="sm" />
      </div>
      {enabled && children && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/30 pt-2">
          {children}
        </div>
      )}
    </div>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
}: NumberFieldProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={NUM_INPUT_CLS}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  )
}
