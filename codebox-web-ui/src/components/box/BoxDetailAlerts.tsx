import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { ContainerStatus } from "@/net/http/types"

/** Delay before showing the reconnecting banner to avoid brief flicker. */
const RECONNECT_BANNER_DELAY_MS = 2_000

interface BoxDetailAlertsProps {
  containerStatus: ContainerStatus
  grpcConnected: boolean
  isConnected: boolean
  errorDetail?: string | null
}

export function BoxDetailAlerts({
  containerStatus,
  grpcConnected,
  isConnected,
  errorDetail,
}: BoxDetailAlertsProps) {
  const isRunning = containerStatus === ContainerStatus.RUNNING

  // Consolidated connection warning — show ONE banner for any connection issue.
  // We delay showing it so that brief SSE reconnections don't cause flicker.
  const hasConnectionIssue = isRunning && (!grpcConnected || !isConnected)
  const [showConnectionWarning, setShowConnectionWarning] = useState(false)

  useEffect(() => {
    if (!hasConnectionIssue) {
      setShowConnectionWarning(false)
      return
    }
    const timer = setTimeout(
      () => setShowConnectionWarning(true),
      RECONNECT_BANNER_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [hasConnectionIssue])

  return (
    <>
      {showConnectionWarning && (
        <div className="mx-4 mt-1 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
          <span className="size-1.5 animate-pulse rounded-full bg-warning" />
          <span className="text-sm text-warning">
            Reconnecting…
          </span>
        </div>
      )}

      {/* Error banner for failed boxes */}
      {errorDetail && (
        <div className="mx-4 mt-1 rounded-lg border border-l-4 border-destructive/30 border-l-destructive bg-destructive/5 px-3 py-2">
          <div className="mb-0.5 flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-state-error/80" />
            <span className="text-xs text-state-error/60">
              Failed to start
            </span>
          </div>
          <p className="text-sm text-state-error">{errorDetail}</p>
        </div>
      )}
    </>
  )
}
