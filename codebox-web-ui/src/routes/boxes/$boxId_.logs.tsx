import { useEffect, useRef } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useBox, useBoxLogs } from "@/net/query"

export const Route = createFileRoute("/boxes/$boxId_/logs")({
  component: ContainerLogsPage,
})

function ContainerLogsPage() {
  const { boxId } = Route.useParams()
  const { data: box } = useBox(boxId)
  const { data, isLoading, refetch, isFetching } = useBoxLogs(
    boxId,
    500,
    true
  )
  const scrollRef = useRef<HTMLPreElement>(null)
  const wasAtBottomRef = useRef(true)

  // Auto-scroll to bottom when new logs arrive, but only if user was at bottom
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
    <div className="flex h-[calc(100svh-24px)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-2">
        <Button
          variant="ghost"
          size="icon-xs"
          nativeButton={false}
          render={
            <Link to="/boxes/$boxId" params={{ boxId }} />
          }
          className="shrink-0 text-muted-foreground"
        >
          <ArrowLeft size={16} />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-sm font-medium">
            Container Logs
            {box?.name ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                — {box.name}
              </span>
            ) : null}
          </h1>
        </div>
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
      <div className="min-h-0 flex-1 p-2">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
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
