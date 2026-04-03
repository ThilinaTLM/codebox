import { useCallback, useEffect, useRef, useState } from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { RotateCw, Square, Trash2 } from "lucide-react"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { BoxInput } from "@/components/box/BoxInput"
import { FileExplorer } from "@/components/box/FileExplorer"
import { FilePreview } from "@/components/box/FilePreview"
import { ActivityBar } from "@/components/box/ActivityBar"
import { BoxStatusBadge } from "@/components/box/BoxStatusBadge"
import { ChatStream } from "@/components/chat/ChatStream"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useQueryClient } from "@tanstack/react-query"
import { useBox, useBoxMessages, useCancelBox, useDeleteBox, useRestartBox, useSendExec, useSendMessage, useStopBox } from "@/net/query"
import { useBoxStream } from "@/net/sse/useBoxStream"
import { ContainerStatus } from "@/net/http/types"
import { useAgentActivity } from "@/hooks/useAgentActivity"
import { useSetBoxPageActions } from "@/components/box/BoxPageContext"

export const Route = createFileRoute("/boxes/$boxId")({
  component: BoxDetailPage,
})

function BoxDetailPage() {
  const { boxId } = Route.useParams()
  const { data: box, isLoading, refetch } = useBox(boxId)
  const { data: messages } = useBoxMessages(boxId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const stopMutation = useStopBox()
  const deleteMutation = useDeleteBox()
  const restartMutation = useRestartBox()
  const [showFiles, setShowFiles] = useState(true)
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const filePanelRef = useRef<PanelImperativeHandle>(null)
  const setBoxPageActions = useSetBoxPageActions()

  const isActive =
    box?.container_status === ContainerStatus.RUNNING ||
    box?.container_status === ContainerStatus.STARTING

  const isStopped = box?.container_status === ContainerStatus.STOPPED

  const { events, isConnected, clearEvents } = useBoxStream({
    boxId,
    enabled: true,
  })
  const sendMessageMutation = useSendMessage()
  const sendExecMutation = useSendExec()
  const cancelMutation = useCancelBox()

  const activity = useAgentActivity(events, box?.container_status, box?.activity)

  // When agent finishes a turn (done/error), refetch messages and clear live events
  useEffect(() => {
    const lastEvent = events[events.length - 1]
    if (lastEvent && (lastEvent.type === "done" || lastEvent.type === "error")) {
      queryClient.invalidateQueries({ queryKey: ["boxes", boxId, "messages"] })
      // Small delay so the done/error block renders momentarily before clearing
      const timer = setTimeout(clearEvents, 150)
      return () => clearTimeout(timer)
    }
  }, [events, boxId, queryClient, clearEvents])

  const handleStop = useCallback(() => {
    stopMutation.mutate(boxId, {
      onSuccess: () => toast.success("Agent stopped"),
      onError: () => toast.error("Failed to stop"),
    })
  }, [stopMutation, boxId])

  const handleRestart = useCallback(() => {
    restartMutation.mutate(boxId, {
      onSuccess: () => {
        toast.success("Agent restarting")
        refetch()
      },
      onError: () => toast.error("Failed to restart"),
    })
  }, [restartMutation, boxId, refetch])

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

  const handleFileSelect = useCallback((path: string) => {
    setPreviewFile(path)
  }, [])

  const handleClosePreview = useCallback(() => {
    setPreviewFile(null)
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
      onRestart: isStopped ? handleRestart : undefined,
      isStopPending: stopMutation.isPending,
      isDeletePending: deleteMutation.isPending,
    })
    return () => setBoxPageActions(null)
  }, [box, isActive, isConnected, activity, showFiles, isStopped, toggleFiles, handleStop, handleRestart, handleDelete, stopMutation.isPending, deleteMutation.isPending, setBoxPageActions])

  const handleSendMessage = useCallback(
    (content: string) => {
      sendMessageMutation.mutate({ boxId, message: content })
    },
    [sendMessageMutation, boxId]
  )

  const handleSendExec = useCallback(
    (command: string) => {
      sendExecMutation.mutate({ boxId, command })
    },
    [sendExecMutation, boxId]
  )

  const handleCancel = useCallback(() => {
    cancelMutation.mutate(boxId)
  }, [cancelMutation, boxId])

  if (isLoading) return <BoxDetailSkeleton />

  if (!box) {
    return (
      <div className="flex h-[calc(100svh-24px)] flex-col items-center justify-center gap-4">
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
    box.container_status === ContainerStatus.RUNNING

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      {/* Main content area */}
      <div className="min-h-0 flex-1 p-2">
        <ResizablePanelGroup orientation="horizontal" id="box-detail">
          {/* File explorer panel */}
          <ResizablePanel
            panelRef={filePanelRef}
            id="file-explorer"
            defaultSize={20}
            minSize={15}
            collapsible
            collapsedSize={0}
            onResize={(size) => setShowFiles(size.asPercentage > 0)}
            className="rounded-lg border border-border/60 bg-card"
          >
            {canShowFiles ? (
              <FileExplorer boxId={boxId} onFileSelect={handleFileSelect} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-muted-foreground">
                  {box.container_status === ContainerStatus.STARTING
                    ? "Starting..."
                    : "Not active"}
                </p>
              </div>
            )}
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-transparent" />

          {/* Chat panel */}
          <ResizablePanel id="chat-panel" defaultSize={80} minSize={30}>
            <div className="relative flex h-full flex-col">
              {/* Inline header */}
              <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm">
                    {box.name || "Agent"}
                  </span>
                  <BoxStatusBadge
                    containerStatus={box.container_status}
                    boxActivity={box.activity}
                    taskOutcome={box.task_outcome}
                    activity={activity}
                  />
                  <span className="font-terminal text-xs text-muted-foreground">
                    {box.model}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isStopped && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRestart}
                      disabled={restartMutation.isPending}
                      className="gap-1.5 font-terminal text-xs"
                    >
                      <RotateCw size={12} className={restartMutation.isPending ? "animate-spin" : ""} />
                      {restartMutation.isPending ? "Restarting" : "Restart"}
                    </Button>
                  )}
                  {isActive && (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={stopMutation.isPending}
                            className="gap-1.5 font-terminal text-xs"
                          />
                        }
                      >
                        <Square size={10} fill="currentColor" />
                        Stop
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Stop agent?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will stop the running agent container. You can restart it later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleStop}>
                            Stop
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={deleteMutation.isPending}
                          className="text-muted-foreground hover:text-destructive"
                        />
                      }
                    >
                      <Trash2 size={14} />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete agent?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. The agent and all its data will be permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* Activity bar */}
              <ActivityBar activity={activity} />

              {/* Event stream */}
              <div className="min-h-0 flex-1">
                <ChatStream messages={messages ?? []} liveEvents={events} centered bottomInset />
              </div>

              {/* Floating input */}
              <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
                <div className="mx-auto max-w-3xl">
                  <BoxInput
                    onSendMessage={handleSendMessage}
                    onSendExec={handleSendExec}
                    onCancel={handleCancel}
                    isWorking={activity.isWorking}
                    disabled={!isActive || !isConnected}
                  />
                </div>
              </div>
            </div>
          </ResizablePanel>

        </ResizablePanelGroup>

        <FilePreview
          boxId={boxId}
          filePath={previewFile}
          onClose={handleClosePreview}
        />
      </div>
    </div>
  )
}

function BoxDetailSkeleton() {
  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
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
