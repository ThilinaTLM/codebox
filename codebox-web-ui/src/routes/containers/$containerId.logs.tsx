import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useContainerLogs } from "@/net/query"

export const Route = createFileRoute("/containers/$containerId/logs")({
  component: ContainerLogsPage,
})

const TAIL_OPTIONS = [100, 200, 500] as const

function ContainerLogsPage() {
  const { containerId } = Route.useParams()
  const [tail, setTail] = useState<number>(200)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const scrollRef = useRef<HTMLPreElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  const { data, isLoading } = useContainerLogs(containerId, tail, autoRefresh)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (shouldAutoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [data?.logs, shouldAutoScroll])

  // Detect if user scrolled up (disable auto-scroll)
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 40
    setShouldAutoScroll(atBottom)
  }

  const shortId = containerId.slice(0, 12)

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      {/* Compact header with breadcrumb */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <nav className="font-terminal text-xs text-muted-foreground">
          <Link
            to="/settings"
            search={{ tab: "containers" }}
            className="hover:text-foreground transition-colors"
          >
            Containers
          </Link>
          <span className="mx-1.5 text-muted-foreground/50">/</span>
          <span className="font-terminal text-foreground">{shortId}</span>
          <span className="mx-1.5 text-muted-foreground/50">/</span>
          <span className="text-foreground">Logs</span>
        </nav>
      </div>

      {/* Controls toolbar */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-terminal text-xs text-muted-foreground">
            Tail:
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
            {TAIL_OPTIONS.map((n) => (
              <Button
                key={n}
                variant={tail === n ? "default" : "ghost"}
                size="xs"
                onClick={() => setTail(n)}
                className="font-terminal text-xs"
              >
                {n}
              </Button>
            ))}
          </div>
        </div>
        <div className="ml-auto">
          <Button
            variant={autoRefresh ? "default" : "ghost"}
            size="xs"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="font-terminal text-xs"
          >
            {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
          </Button>
        </div>
      </div>

      {/* Log output */}
      <div className="min-h-0 flex-1 p-4">
        <div className="h-full">
          {isLoading ? (
            <div className="space-y-1 p-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : (
            <pre
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full overflow-auto rounded-lg border border-border bg-inset p-4 font-terminal text-xs leading-relaxed break-all whitespace-pre-wrap text-foreground/80"
            >
              {data?.logs || "No logs available."}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
