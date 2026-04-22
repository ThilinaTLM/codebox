import { useState } from "react"
import { toast } from "sonner"
import type { AgentTemplate, AgentTemplateDryRunResult } from "@/net/http/types"
import { useDryRunAgentTemplate } from "@/net/query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"

const EVENT_TYPES = [
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "push",
]

interface Props {
  projectSlug: string
  template: AgentTemplate
}

export function AgentTemplateDryRunPanel({ projectSlug, template }: Props) {
  const isScheduled = template.trigger_kind === "schedule"
  const [eventType, setEventType] = useState(
    isScheduled
      ? "issues"
      : template.trigger_kind.replace("github.", "")
  )
  const [payload, setPayload] = useState('{\n  "action": "opened"\n}')
  const [result, setResult] = useState<AgentTemplateDryRunResult | null>(null)
  const mutation = useDryRunAgentTemplate(projectSlug, template.id)

  const handleRun = () => {
    let parsed: Record<string, unknown> = {}
    if (!isScheduled) {
      try {
        parsed = JSON.parse(payload)
      } catch {
        toast.error("Payload is not valid JSON")
        return
      }
    }
    mutation.mutate(
      {
        event_type: isScheduled ? null : eventType,
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
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
          Dry run
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Evaluate filters and render prompts without creating a box.
        </p>
      </div>

      {!isScheduled && (
        <>
          <div className="space-y-2">
            <Label htmlFor="dry-event-type">Event type</Label>
            <NativeSelect
              id="dry-event-type"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full"
            >
              {EVENT_TYPES.map((et) => (
                <NativeSelectOption key={et} value={et}>
                  {et}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dry-payload">Payload JSON</Label>
            <Textarea
              id="dry-payload"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
        </>
      )}

      <Button
        type="button"
        size="sm"
        onClick={handleRun}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Running..." : "Run dry-run"}
      </Button>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={result.matched ? "default" : "secondary"}>
              {result.matched ? "Matched" : "Skipped"}
            </Badge>
            {result.reason && (
              <span className="text-xs text-muted-foreground">
                {result.reason}
              </span>
            )}
          </div>
          {result.rendered_system_prompt && (
            <div className="space-y-1">
              <Label className="text-xs">Rendered system prompt</Label>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                {result.rendered_system_prompt}
              </pre>
            </div>
          )}
          {result.rendered_initial_prompt && (
            <div className="space-y-1">
              <Label className="text-xs">Rendered initial prompt</Label>
              <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                {result.rendered_initial_prompt}
              </pre>
            </div>
          )}
          {result.setup_commands.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Setup commands</Label>
              <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                {result.setup_commands.join("\n")}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
