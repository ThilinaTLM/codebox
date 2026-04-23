/**
 * Cron presets offered by the schedule trigger's CronBuilder.
 *
 * The ``Custom`` sentinel is used whenever the user edits the raw cron
 * string to something that no preset matches.
 */

export type CronPresetId =
  | "hourly"
  | "daily-09"
  | "weekday-09"
  | "monday-09"
  | "weekly"
  | "monthly"
  | "custom"

export interface CronPreset {
  id: CronPresetId
  label: string
  description: string
  cron: string | null
}

export const CRON_PRESETS: ReadonlyArray<CronPreset> = [
  {
    id: "hourly",
    label: "Every hour",
    description: "At minute 0 of every hour",
    cron: "0 * * * *",
  },
  {
    id: "daily-09",
    label: "Every day at 09:00",
    description: "Once a day, at 09:00",
    cron: "0 9 * * *",
  },
  {
    id: "weekday-09",
    label: "Every weekday at 09:00",
    description: "Monday to Friday, 09:00",
    cron: "0 9 * * 1-5",
  },
  {
    id: "monday-09",
    label: "Every Monday at 09:00",
    description: "Once a week, Monday 09:00",
    cron: "0 9 * * 1",
  },
  {
    id: "weekly",
    label: "Every Sunday at 00:00",
    description: "Once a week, Sunday midnight",
    cron: "0 0 * * 0",
  },
  {
    id: "monthly",
    label: "First day of the month, 00:00",
    description: "Once per month",
    cron: "0 0 1 * *",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Use a custom 5-field cron expression",
    cron: null,
  },
] as const

export function presetFromCron(cron: string): CronPresetId {
  const normalized = cron.trim().replace(/\s+/g, " ")
  const found = CRON_PRESETS.find((p) => p.cron === normalized)
  return found?.id ?? "custom"
}

export function presetById(id: CronPresetId): CronPreset {
  return CRON_PRESETS.find((p) => p.id === id) ?? CRON_PRESETS[0]
}

// ── Timezones ───────────────────────────────────────────────

export const COMMON_TIMEZONES: ReadonlyArray<string> = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const

/**
 * Validate a 5-field cron expression. Permissive — we accept any tokens
 * that contain only the standard characters; real validation happens on
 * the server.
 */
export function isValidCron(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const parts = trimmed.split(/\s+/)
  if (parts.length !== 5) return false
  return parts.every((p) => /^[0-9*/,\-?LW#A-Z]+$/i.test(p))
}
