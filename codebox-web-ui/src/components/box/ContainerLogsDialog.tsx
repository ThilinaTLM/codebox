import { useEffect, useRef } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useBoxLogs } from "@/net/query"

interface ContainerLogsDialogProps {
  boxId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContainerLogsDialog({
  boxId,
  open,
  onOpenChange,
}: ContainerLogsDialogProps) {
  const { data, isLoading, refetch, isFetching } = useBoxLogs(
    open ? boxId : null,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Container Logs</span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="ml-auto text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw
                size={12}
                className={isFetching ? "animate-spin" : ""}
              />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] min-h-[300px]">
          {isLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <pre
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-[65vh] overflow-auto rounded-md bg-inset p-4 font-terminal text-xs leading-relaxed text-foreground/90"
            >
              {data?.logs || "No logs available"}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
