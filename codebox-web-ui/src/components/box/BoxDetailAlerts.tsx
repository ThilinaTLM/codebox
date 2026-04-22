import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { ContainerStatus } from "@/net/http/types"

/**
 * Delay before showing the sandbox-disconnected banner, to avoid flicker from
 * brief gRPC blips. The per-box SSE (chat stream) is intentionally *not*
 * surfaced here — it is shown in the StatusBar and does not actually block
 * agent work (send / exec go through separate channels).
 */
const GRPC_BANNER_DELAY_MS = 3_000

interface BoxDetailAlertsProps {
  containerStatus: ContainerStatus
  grpcConnected: boolean
  errorDetail?: string | null
}

export function BoxDetailAlerts({
  containerStatus,
  grpcConnected,
  errorDetail,
}: BoxDetailAlertsProps) {
  const isRunning = containerStatus === ContainerStatus.RUNNING
  const hasGrpcIssue = isRunning && !grpcConnected
  const [showGrpcWarning, setShowGrpcWarning] = useState(false)

  useEffect(() => {
    if (!hasGrpcIssue) {
      setShowGrpcWarning(false)
      return
    }
    const timer = setTimeout(
      () => setShowGrpcWarning(true),
      GRPC_BANNER_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [hasGrpcIssue])

  return (
    <>
      {showGrpcWarning && (
        <div className="mx-4 mt-1 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
          <span className="size-1.5 animate-pulse rounded-full bg-warning" />
          <span className="text-sm text-warning">
            Sandbox disconnected. Reconnecting…
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
