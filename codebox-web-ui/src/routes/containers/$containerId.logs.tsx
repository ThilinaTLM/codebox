import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-y-auto">
      {/* Page header */}
      <div className="bg-hero-gradient px-6 pt-10 pb-8">
        <div className="mx-auto max-w-6xl">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to="/containers" />}>
                  Containers
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Logs</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="font-display mt-3 text-4xl font-bold tracking-tight">
            Container Logs
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground font-mono">
            {shortId}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="border-b px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Tail:</span>
            {TAIL_OPTIONS.map((n) => (
              <Button
                key={n}
                variant={tail === n ? "default" : "outline"}
                size="xs"
                onClick={() => setTail(n)}
              >
                {n}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="xs"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
            </Button>
          </div>
        </div>
      </div>

      {/* Log output */}
      <div className="flex-1 px-6 pb-6 pt-4 min-h-0">
        <div className="mx-auto max-w-6xl h-full">
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
              className="h-full overflow-auto rounded-lg terminal-bg p-4 text-xs leading-relaxed text-foreground/80 font-mono whitespace-pre-wrap break-all"
            >
              {data?.logs || "No logs available."}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
