import { useMemo, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  FlashIcon,
  PlayCircleIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { FormField } from "./FormField"
import { scenariosFor } from "./dryRunScenarios"
import { triggerKindMeta } from "./metadata"
import type {
  Automation,
  AutomationDryRunResult,
} from "@/net/http/types"
import { useDryRunAutomation } from "@/net/query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface AutomationDryRunPanelProps {
  projectSlug: string
  automation: Automation
}

const CUSTOM_SCENARIO_ID = "__custom__"

export function AutomationDryRunPanel({
  projectSlug,
  automation,
}: AutomationDryRunPanelProps) {
  const isScheduled = automation.trigger_kind === "schedule"
  const trigger = triggerKindMeta(automation.trigger_kind)
  const scenarios = useMemo(
    () => scenariosFor(automation.trigger_kind),
    [automation.trigger_kind]
  )

  const defaultScenario = scenarios.length > 0 ? scenarios[0] : null
  const defaultPayload = defaultScenario
    ? JSON.stringify(defaultScenario.payload, null, 2)
    : '{\n  "action": "opened"\n}'

  const [scenarioId, setScenarioId] = useState<string>(
    defaultScenario ? defaultScenario.id : CUSTOM_SCENARIO_ID
  )
  const [payload, setPayload] = useState<string>(defaultPayload)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [result, setResult] = useState<AutomationDryRunResult | null>(null)

  const mutation = useDryRunAutomation(projectSlug, automation.id)

  const handleScenarioChange = (id: string) => {
    setScenarioId(id)
    setJsonError(null)
    if (id === CUSTOM_SCENARIO_ID) return
    const sc = scenarios.find((s) => s.id === id)
    if (sc) setPayload(JSON.stringify(sc.payload, null, 2))
  }

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      setPayload(JSON.stringify(parsed, null, 2))
      setJsonError(null)
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON")
    }
  }

  const handleRun = () => {
    let parsed: Record<string, unknown> | null = null
    if (!isScheduled) {
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>
        setJsonError(null)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid JSON"
        setJsonError(msg)
        toast.error("Payload is not valid JSON")
        return
      }
    }
    mutation.mutate(
      {
        event_type: isScheduled ? null : trigger.eventType,
        payload: isScheduled ? null : parsed,
        schedule: isScheduled,
      },
      {
        onSuccess: (res) => setResult(res),
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : "Dry-run failed"
          toast.error(msg)
        },
      }
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Inputs */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 font-display text-base">
            <HugeiconsIcon icon={FlashIcon} strokeWidth={2} className="size-4" />
            {isScheduled ? "Simulate a scheduled tick" : "Simulate an event"}
          </h3>
          <p className="text-sm text-muted-foreground">
            Evaluate filters and render prompts without creating a box.
          </p>
        </div>

        {!isScheduled && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <HugeiconsIcon
                  icon={trigger.icon}
                  strokeWidth={2}
                  className="size-3"
                />
                Event: {trigger.eventType}
              </Badge>
            </div>

            {scenarios.length > 0 && (
              <FormField
                label="Scenario"
                htmlFor="dry-scenario"
                description="Choose a ready-made payload or edit your own."
              >
                <Select
                  value={scenarioId}
                  onValueChange={(v) => v && handleScenarioChange(v)}
                >
                  <SelectTrigger id="dry-scenario" className="w-full">
                    <SelectValue>
                      {scenarioId === CUSTOM_SCENARIO_ID
                        ? "Custom payload"
                        : scenarios.find((s) => s.id === scenarioId)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {scenarios.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex flex-col gap-0.5">
                          <span>{s.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {s.description}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_SCENARIO_ID}>
                      <span className="flex flex-col gap-0.5">
                        <span>Custom payload</span>
                        <span className="text-xs text-muted-foreground">
                          Keep editing the JSON below.
                        </span>
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}

            <FormField
              label="Payload JSON"
              htmlFor="dry-payload"
              error={jsonError ?? undefined}
              description={
                jsonError
                  ? undefined
                  : "Sent to the automation engine verbatim. Only fields used by filters + variables are needed."
              }
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleFormat}
                >
                  Format
                </Button>
              }
            >
              <Textarea
                id="dry-payload"
                value={payload}
                onChange={(e) => {
                  setPayload(e.target.value)
                  setScenarioId(CUSTOM_SCENARIO_ID)
                  if (jsonError) setJsonError(null)
                }}
                rows={14}
                className="font-mono text-xs"
                aria-invalid={!!jsonError || undefined}
              />
            </FormField>
          </>
        )}

        <Button
          type="button"
          onClick={handleRun}
          disabled={mutation.isPending}
        >
          <HugeiconsIcon
            icon={PlayCircleIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {mutation.isPending ? "Running…" : "Run dry-run"}
        </Button>
      </div>

      {/* Result */}
      <div className="space-y-3">
        <h3 className="font-display text-base">Result</h3>
        {!result ? (
          <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center text-xs text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                className="size-5"
              />
              Run a simulation to preview the match result and rendered prompts.
            </div>
          </div>
        ) : (
          <DryRunResultView result={result} />
        )}
      </div>
    </div>
  )
}

function DryRunResultView({ result }: { result: AutomationDryRunResult }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge
          variant={result.matched ? "default" : "secondary"}
          className="text-xs"
        >
          {result.matched ? "Matched" : "Skipped"}
        </Badge>
        {result.reason && (
          <span className="text-xs text-muted-foreground">
            {result.reason}
          </span>
        )}
      </div>

      {result.rendered_system_prompt && (
        <CodeBlock
          label="Rendered system prompt"
          content={result.rendered_system_prompt}
        />
      )}
      {result.rendered_initial_prompt && (
        <CodeBlock
          label="Rendered initial prompt"
          content={result.rendered_initial_prompt}
        />
      )}
      {result.setup_commands.length > 0 && (
        <CodeBlock
          label="Setup commands"
          content={result.setup_commands.join("\n")}
        />
      )}
    </div>
  )
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  const handleCopy = () => {
    navigator.clipboard
      .writeText(content)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error("Could not copy to clipboard"))
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <Button type="button" variant="ghost" size="xs" onClick={handleCopy}>
          <HugeiconsIcon
            icon={Copy01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Copy
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto rounded-md border border-border/50 bg-muted p-3 font-mono text-[11px] leading-relaxed">
        {content}
      </pre>
    </div>
  )
}
