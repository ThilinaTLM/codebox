import { useCallback, useEffect, useRef, useState } from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import type { WSEvent } from "@/net/http/types"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoxInput } from "@/components/box/BoxInput"
import { FileExplorer } from "@/components/box/FileExplorer"
import { EventStream } from "@/components/task/EventStream"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useBox, useDeleteBox, useStopBox } from "@/net/query"
import { useBoxWebSocket } from "@/net/ws"
import { BoxStatus } from "@/net/http/types"
import { useAgentActivity } from "@/hooks/useAgentActivity"
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
  const [showFiles, setShowFiles] = useState(true)
  const filePanelRef = useRef<PanelImperativeHandle>(null)
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

  const activity = useAgentActivity(events, box?.status)

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

  const toggleFiles = useCallback(() => {
    const panel = filePanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [])

  useEffect(() => {
    if (!box) return
    setBoxPageActions({
      isActive,
      isConnected,
      activity,
      showFiles,
      onToggleFiles: toggleFiles,
      onStop: handleStop,
      onDelete: handleDelete,
      isStopPending: stopMutation.isPending,
      isDeletePending: deleteMutation.isPending,
    })
    return () => setBoxPageActions(null)
  }, [box, isActive, isConnected, activity, showFiles, toggleFiles, handleStop, handleDelete, stopMutation.isPending, deleteMutation.isPending, setBoxPageActions])

  const localEventsRef = useRef<Array<WSEvent>>([])

  const handleSendMessage = useCallback(
    (content: string) => {
      localEventsRef.current = [
        ...localEventsRef.current,
        { type: "status_change", status: BoxStatus.RUNNING } as WSEvent,
      ]
      sendMessage(content)
    },
    [sendMessage]
  )

  const handleSendExec = useCallback(
    (command: string) => {
      sendExec(command)
    },
    [sendExec]
  )

  if (isLoading) return <BoxDetailSkeleton />

  if (!box) {
    return (
      <div className="flex h-[calc(100svh-3rem)] flex-col items-center justify-center gap-4">
        <h2 className="font-display text-lg font-semibold">Agent not found</h2>
        <p className="text-sm text-muted-foreground">
          This agent may have been deleted.
        </p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to="/" />}
        >
          Go home
        </Button>
      </div>
    )
  }

  const canShowFiles =
    box.status === BoxStatus.IDLE || box.status === BoxStatus.RUNNING

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col">
      {/* Main content area */}
      <div className="min-h-0 flex-1 p-2">
        <ResizablePanelGroup orientation="horizontal" id="box-detail">
          {/* File explorer panel */}
          <ResizablePanel
            panelRef={filePanelRef}
            id="file-explorer"
            defaultSize={25}
            minSize={15}
            collapsible
            collapsedSize={0}
            onResize={(size) => setShowFiles(size.asPercentage > 0)}
            className="rounded-lg border border-border/60 bg-muted/30"
          >
            {canShowFiles ? (
              <FileExplorer boxId={boxId} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-muted-foreground">
                  {box.status === BoxStatus.STARTING
                    ? "Starting..."
                    : "Not active"}
                </p>
              </div>
            )}
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-transparent" />

          {/* Chat panel */}
          <ResizablePanel id="chat-panel" defaultSize={95} minSize={30}>
            <div className="relative flex h-full flex-col">
              {/* Event stream */}
              <div className="min-h-0 flex-1">
                <EventStream events={events} centered bottomInset />
              </div>

              {/* Floating input */}
              <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
                <div className="mx-auto max-w-3xl">
                  <BoxInput
                    onSendMessage={handleSendMessage}
                    onSendExec={handleSendExec}
                    disabled={!isActive || !isConnected}
                  />
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

function BoxDetailSkeleton() {
  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col">
      <div className="flex-1 p-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-3/4 rounded-lg" />
          <Skeleton className="h-16 w-1/2 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
