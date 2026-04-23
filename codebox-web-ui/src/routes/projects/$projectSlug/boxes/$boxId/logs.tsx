import { useEffect, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CodeboxLogoLoader } from "@/components/layout/CodeboxLogoLoader"
import { useBoxDetail } from "@/components/box/BoxDetailContext"
import { useBoxLogs } from "@/net/query"

export const Route = createFileRoute(
  "/projects/$projectSlug/boxes/$boxId/logs"
)({
  component: BoxLogsPage,
})

function BoxLogsPage() {
  const { projectSlug, boxId } = useBoxDetail()
  const { data, isLoading, refetch, isFetching } = useBoxLogs(
    projectSlug,
    boxId,
    500,
    true
  )
  const scrollRef = useRef<HTMLPreElement>(null)
  const wasAtBottomRef = useRef(true)

  // Auto-scroll to bottom when new logs arrive, but only if user was at bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [data?.logs])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 40
    wasAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-label">Container Logs</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="text-muted-foreground"
          title="Refresh"
        >
          <RefreshCw
            size={12}
            className={isFetching ? "animate-spin" : ""}
          />
        </Button>
      </div>

      {/* Log content */}
      <div className="min-h-0 flex-1 px-2 pb-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <CodeboxLogoLoader className="size-10 text-muted-foreground" />
          </div>
        ) : (
          <pre
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-auto rounded-lg border border-border/60 bg-inset p-4 font-terminal text-xs leading-relaxed text-foreground/90"
          >
            {data?.logs || "No logs available"}
          </pre>
        )}
      </div>
    </div>
  )
}
