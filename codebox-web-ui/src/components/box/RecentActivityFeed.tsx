import { formatDistanceToNow } from "date-fns"
import {
  AlertCircle,
  CheckCircle,
  HelpCircle,
  MessageSquare,
  Play,
  Terminal,
  User,
  Wrench,
} from "lucide-react"
import type { CanonicalEvent } from "@/net/http/types"

interface RecentActivityFeedProps {
  events: Array<CanonicalEvent>
}

// Events worth showing in the overview feed
const VISIBLE_KINDS = new Set([
  "message.completed",
  "tool_call.started",
  "tool_call.completed",
  "tool_call.failed",
  "command.started",
  "command.completed",
  "command.failed",
  "run.started",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "input_requested",
])

interface FeedItem {
  key: string
  icon: React.ReactNode
  label: string
  detail?: string
  timestamp: number
  variant?: "default" | "success" | "error" | "info"
}

function eventToFeedItem(event: CanonicalEvent): FeedItem | null {
  if (!VISIBLE_KINDS.has(event.kind)) return null

  const payload = event.payload
  const ts = event.timestamp_ms

  switch (event.kind) {
    case "message.completed": {
      const role = String(payload.role ?? "assistant")
      const content = String(payload.content ?? "")
      const truncated =
        content.length > 120 ? `${content.slice(0, 120)}…` : content
      if (role === "user") {
        return {
          key: event.event_id,
          icon: <User size={12} />,
          label: "You",
          detail: truncated,
          timestamp: ts,
        }
      }
      if (role === "assistant" && content) {
        return {
          key: event.event_id,
          icon: <MessageSquare size={12} />,
          label: "Agent",
          detail: truncated,
          timestamp: ts,
        }
      }
      return null
    }

    case "tool_call.started":
      return {
        key: event.event_id,
        icon: <Wrench size={12} />,
        label: `Using ${String(payload.name ?? "tool")}`,
        timestamp: ts,
        variant: "info",
      }

    case "tool_call.completed":
    case "tool_call.failed":
      return null // Started event covers it

    case "command.started": {
      const command = String(payload.command ?? "")
      return {
        key: event.event_id,
        icon: <Terminal size={12} />,
        label: "Agent command",
        detail:
          command.length > 80 ? `${command.slice(0, 80)}…` : command,
        timestamp: ts,
      }
    }

    case "command.completed":
    case "command.failed":
      return null // Started event covers it

    case "run.started":
      return {
        key: event.event_id,
        icon: <Play size={12} />,
        label: "Run started",
        timestamp: ts,
        variant: "info",
      }

    case "run.completed":
      return {
        key: event.event_id,
        icon: <CheckCircle size={12} />,
        label: "Run completed",
        timestamp: ts,
        variant: "success",
      }

    case "run.failed":
      return {
        key: event.event_id,
        icon: <AlertCircle size={12} />,
        label: "Run failed",
        detail: String(payload.error ?? ""),
        timestamp: ts,
        variant: "error",
      }

    case "run.cancelled":
      return {
        key: event.event_id,
        icon: <AlertCircle size={12} />,
        label: "Cancelled",
        timestamp: ts,
      }

    case "input_requested":
      return {
        key: event.event_id,
        icon: <HelpCircle size={12} />,
        label: "Input requested",
        detail: String(payload.message ?? ""),
        timestamp: ts,
        variant: "info",
      }

    default:
      return null
  }
}

const VARIANT_STYLES: Record<string, string> = {
  default: "text-muted-foreground",
  success: "text-state-completed",
  error: "text-state-error",
  info: "text-foreground/60",
}

export function RecentActivityFeed({ events }: RecentActivityFeedProps) {
  const items = events
    .map(eventToFeedItem)
    .filter((item): item is FeedItem => item !== null)

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No activity yet
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {items.map((item, idx) => (
        <div
          key={item.key}
          className="group relative flex gap-3 py-2"
        >
          {/* Timeline line */}
          {idx < items.length - 1 && (
            <div className="absolute top-6 left-[11px] h-[calc(100%-12px)] w-px bg-border/50" />
          )}

          {/* Icon */}
          <div
            className={`relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card ${VARIANT_STYLES[item.variant ?? "default"]}`}
          >
            {item.icon}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-foreground/90">
                {item.label}
              </span>
              <span className="shrink-0 text-2xs text-ghost">
                {formatDistanceToNow(item.timestamp, { addSuffix: true })}
              </span>
            </div>
            {item.detail && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {item.detail}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
