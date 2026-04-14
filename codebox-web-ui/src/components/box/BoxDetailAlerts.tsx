import { AlertTriangle } from "lucide-react"
import { ContainerStatus } from "@/net/http/types"

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

  // Consolidated connection warning — show ONE banner for any connection issue
  const showConnectionWarning =
    isRunning && (!grpcConnected || !isConnected)

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
