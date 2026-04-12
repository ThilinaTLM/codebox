import { AlertTriangle } from "lucide-react"
import { ContainerStatus } from "@/net/http/types"

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
  return (
    <>
      {/* gRPC connection warning */}
      {containerStatus === ContainerStatus.RUNNING && !grpcConnected && (
        <div className="mx-4 mt-1 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 text-warning" />
          <span className="text-sm text-warning">
            Sandbox connection lost
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
