import { useState, useCallback, useRef, useEffect } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoxInput } from "@/components/box/BoxInput"
import { FileExplorer } from "@/components/box/FileExplorer"
import { EventStream } from "@/components/task/EventStream"
import { useBox, useStopBox, useDeleteBox } from "@/net/query"
import { useBoxWebSocket } from "@/net/ws"
import { BoxStatus } from "@/net/http/types"
import type { WSEvent } from "@/net/http/types"
import { toast } from "sonner"
import { useSetBoxPageActions } from "@/components/box/BoxPageContext"

export const Route = createFileRoute("/boxes/$boxId")({
  component: BoxDetailPage,
})

function BoxDetailPage() {
  const { boxId } = Route.useParams()
  const { data: box, isLoading } = useBox(boxId)
  const navigate = useNavigate()
  const stopMutation = useStopBox()
  const deleteMutation = useDeleteBox()
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false)
  const setBoxPageActions = useSetBoxPageActions()

  const isActive =
    box?.status === BoxStatus.IDLE ||
    box?.status === BoxStatus.RUNNING ||
    box?.status === BoxStatus.STARTING

  const { events, sendMessage, sendExec, sendCancel, isConnected } =
    useBoxWebSocket({
      boxId,
      enabled: isActive,
    })

  const handleStop = useCallback(() => {
    sendCancel()
    stopMutation.mutate(boxId, {
      onSuccess: () => toast.success("Agent stopped"),
      onError: () => toast.error("Failed to stop"),
    })
  }, [sendCancel, stopMutation, boxId])

  const handleDelete = useCallback(() => {
    deleteMutation.mutate(boxId, {
      onSuccess: () => {
        toast.success("Agent deleted")
        navigate({ to: "/" })
      },
      onError: () => toast.error("Failed to delete"),
    })
  }, [deleteMutation, boxId, navigate])

  useEffect(() => {
    if (!box) return
    setBoxPageActions({
      fileExplorerOpen,
      toggleFileExplorer: () => setFileExplorerOpen((o) => !o),
      onStop: handleStop,
      onDelete: handleDelete,
      stopPending: stopMutation.isPending,
      isActive,
      isConnected,
    })
    return () => setBoxPageActions(null)
  }, [
    box,
    fileExplorerOpen,
    handleStop,
    handleDelete,
    stopMutation.isPending,
    isActive,
    isConnected,
    setBoxPageActions,
  ])

  const localEventsRef = useRef<WSEvent[]>([])

  const handleSendMessage = useCallback(
    (content: string) => {
      localEventsRef.current = [
        ...localEventsRef.current,
        { type: "status_change", status: BoxStatus.RUNNING } as WSEvent,
      ]
      sendMessage(content)
    },
    [sendMessage],
  )

  const handleSendExec = useCallback(
    (command: string) => {
      localEventsRef.current = [
        ...localEventsRef.current,
        { type: "status_change", status: BoxStatus.RUNNING } as WSEvent,
      ]
      sendExec(command)
    },
    [sendExec],
  )

  if (isLoading) return <BoxDetailSkeleton />

  if (!box) {
    return (
      <div className="flex h-[calc(100svh-3rem)] flex-col items-center justify-center gap-4">
        <h2 className="font-display text-lg font-semibold">Agent not found</h2>
        <p className="text-sm text-muted-foreground">This agent may have been deleted.</p>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/" />}>
          Go home
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col">
      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* File explorer panel (left) */}
        {fileExplorerOpen && (
          <div className="w-64 flex-shrink-0 border-r bg-card/30 lg:w-80">
            {box.status === BoxStatus.IDLE || box.status === BoxStatus.RUNNING ? (
              <FileExplorer boxId={boxId} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {box.status === BoxStatus.STARTING
                    ? "Starting..."
                    : "Not active"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Chat area */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <EventStream events={events} centered />
          </div>

          {/* Input */}
          <div className="border-t bg-background/80 backdrop-blur-sm">
            <div className="mx-auto max-w-3xl px-4 py-4">
              <BoxInput
                onSendMessage={handleSendMessage}
                onSendExec={handleSendExec}
                disabled={!isActive || !isConnected}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BoxDetailSkeleton() {
  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col">
      <div className="flex-1 p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-3/4 rounded-xl" />
          <Skeleton className="h-16 w-1/2 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
