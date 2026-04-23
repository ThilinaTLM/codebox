import { useMemo } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Clock02Icon } from "@hugeicons/core-free-icons"
import { formatDistanceToNow } from "date-fns"
import { FormField } from "../FormField"
import {
  COMMON_TIMEZONES,
  CRON_PRESETS,
  presetById,
  presetFromCron,
} from "../cronPresets"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface CronBuilderProps {
  cron: string
  timezone: string
  onCronChange: (next: string) => void
  onTimezoneChange: (next: string) => void
  nextRunAt?: string | null
  cronError?: string
  timezoneError?: string
  disabled?: boolean
}

export function CronBuilder({
  cron,
  timezone,
  onCronChange,
  onTimezoneChange,
  nextRunAt,
  cronError,
  timezoneError,
  disabled,
}: CronBuilderProps) {
  const presetId = useMemo(() => presetFromCron(cron), [cron])
  const preset = presetById(presetId)

  const handlePresetChange = (id: string) => {
    const selected = presetById(id as typeof presetId)
    if (selected.cron) {
      onCronChange(selected.cron)
    }
    // "custom" keeps the current cron as-is
  }

  const relativeNextRun = useMemo(() => {
    if (!nextRunAt) return null
    try {
      return formatDistanceToNow(new Date(nextRunAt), { addSuffix: true })
    } catch {
      return null
    }
  }, [nextRunAt])

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={Clock02Icon}
          strokeWidth={2}
          className="size-4 text-muted-foreground"
        />
        <h4 className="text-sm font-medium">Schedule</h4>
      </div>

      <FormField
        label="Preset"
        htmlFor="cron-preset"
        description="Pick a schedule or choose Custom to enter a cron expression."
      >
        <Select
          value={presetId}
          onValueChange={(v) => v && handlePresetChange(v)}
          disabled={disabled}
        >
          <SelectTrigger id="cron-preset" className="w-full">
            <SelectValue>{preset.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CRON_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex flex-col gap-0.5">
                  <span>{p.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.cron ?? "Custom 5-field cron"}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Cron expression"
        htmlFor="cron-expression"
        required
        error={cronError}
        description={
          cronError
            ? undefined
            : "5 fields: minute · hour · day-of-month · month · day-of-week."
        }
      >
        <Input
          id="cron-expression"
          value={cron}
          onChange={(e) => onCronChange(e.target.value)}
          placeholder="0 9 * * *"
          className="font-mono"
          disabled={disabled}
          aria-invalid={!!cronError || undefined}
        />
      </FormField>

      <FormField
        label="Timezone"
        htmlFor="cron-timezone"
        required
        error={timezoneError}
        description={
          timezoneError ? undefined : "IANA timezone identifier."
        }
      >
        <Select
          value={timezone}
          onValueChange={(v) => v && onTimezoneChange(v)}
          disabled={disabled}
        >
          <SelectTrigger id="cron-timezone" className="w-full">
            <SelectValue>{timezone}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Common timezones</SelectLabel>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectGroup>
            {!COMMON_TIMEZONES.includes(timezone) && timezone && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Current</SelectLabel>
                  <SelectItem value={timezone}>{timezone}</SelectItem>
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </FormField>

      {relativeNextRun && (
        <div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={Clock02Icon}
            strokeWidth={2}
            className="size-3.5"
          />
          <span>Next run {relativeNextRun}.</span>
        </div>
      )}

    </div>
  )
}
