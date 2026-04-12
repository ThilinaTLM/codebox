import { useCallback, useEffect, useRef, useState } from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Ellipsis,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  useBox,
  useCancelBox,
  useDeleteBox,
  useRestartBox,
  useSendExec,
  useSendMessage,
  useStopBox,
} from "@/net/query"
import { ContainerStatus } from "@/net/http/types"
import { useAgentActivity } from "@/hooks/useAgentActivity"
import { useElapsedTime } from "@/hooks/useElapsedTime"
import { useChatState } from "@/hooks/useChatState"
import { useSetBoxPageActions } from "@/components/box/BoxPageContext"

export const Route = createFileRoute("/boxes/$boxId")({
  component: BoxDetailPage,
})

function BoxDetailPage() {
  const { boxId } = Route.useParams()
  const { data: box, isLoading, refetch } = useBox(boxId)
  const navigate = useNavigate()
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

  // Consolidated chat state — merges history + live SSE, handles deduplication
  const { blocks, liveEvents, isConnected } = useChatState({ boxId })

  const sendMessageMutation = useSendMessage()
  const sendExecMutation = useSendExec()
  const cancelMutation = useCancelBox()

  const activity = useAgentActivity(
    liveEvents,
    box?.container_status,
    box?.activity ?? undefined
  )

  const elapsed = useElapsedTime(box?.started_at ?? null, !!isActive)

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
  }, [
    box,
    isActive,
    isConnected,
    activity,
    showFiles,
    isStopped,
    toggleFiles,
    handleStop,
    handleRestart,
    handleDelete,
    stopMutation.isPending,
    deleteMutation.isPending,
    setBoxPageActions,
  ])

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

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(boxId)
    toast.success("Copied agent ID")
  }, [boxId])

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

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      {/* Main content area */}
      <div className="min-h-0 flex-1 p-2">
        <ResizablePanelGroup orientation="horizontal" id="box-detail">
          {/* File explorer panel */}
          <ResizablePanel
            panelRef={filePanelRef}
            id="file-explorer"
            defaultSize={18}
            minSize={12}
            collapsible
            collapsedSize={0}
            onResize={(size) => setShowFiles(size.asPercentage > 0)}
            className="rounded-lg border border-border/60 bg-card"
          >
            <FileExplorer
              boxId={boxId}
              onFileSelect={handleFileSelect}
              disabled={!isActive}
            />
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-transparent" />

          {/* Chat panel */}
          <ResizablePanel id="chat-panel" defaultSize={80} minSize={30}>
            <div className="flex h-full flex-col">
              {/* Toolbar */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    nativeButton={false}
                    render={<Link to="/" />}
                    className="shrink-0 text-muted-foreground"
                  >
                    <ArrowLeft size={16} />
                  </Button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display text-sm font-medium">
                        {box.name || "Agent"}
                      </span>
                      <BoxStatusBadge
                        containerStatus={box.container_status}
                        boxActivity={box.activity ?? undefined}
                        taskOutcome={box.task_outcome}
                        activity={activity}
                      />
                      {elapsed && (
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          · {elapsed}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {box.description && (
                        <span className="truncate text-xs text-muted-foreground">
                          {box.description}
                        </span>
                      )}
                      {!box.description && (
                        <span className="text-xs text-muted-foreground">
                          {box.provider} · {box.model}
                        </span>
                      )}
                    </div>
                  </div>
                  {box.tags &&
                    box.tags.length > 0 &&
                    box.tags.map((tag) => (
                      <span
                        key={tag}
                        className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-2xs"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isStopped && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRestart}
                      disabled={restartMutation.isPending}
                      className="gap-1.5 text-xs"
                    >
                      <RotateCw
                        size={12}
                        className={
                          restartMutation.isPending ? "animate-spin" : ""
                        }
                      />
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
                            className="gap-1.5 text-xs"
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
                            This will stop the running agent container. You can
                            restart it later.
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
                  {/* Overflow menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground"
                        />
                      }
                    >
                      <Ellipsis size={14} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={handleCopyId}>
                        <Copy size={14} />
                        Copy ID
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={handleDelete}
                      >
                        <Trash2 size={14} />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Activity bar */}
              <ActivityBar activity={activity} />

              {/* gRPC connection warning */}
              {box.container_status === ContainerStatus.RUNNING &&
                !box.grpc_connected && (
                  <div className="mx-4 mt-1 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                    <AlertTriangle size={14} className="shrink-0 text-warning" />
                    <span className="text-sm text-warning">
                      Sandbox connection lost
                    </span>
                  </div>
                )}

              {/* Error banner for failed boxes */}
              {box.error_detail && (
                <div className="mx-4 mt-1 rounded-lg border border-l-4 border-destructive/30 border-l-destructive bg-destructive/5 px-3 py-2">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-state-error/80" />
                    <span className="text-xs text-state-error/60">
                      Failed to start
                    </span>
                  </div>
                  <p className="text-sm text-state-error">
                    {box.error_detail}
                  </p>
                </div>
              )}

              {/* Event stream */}
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChatStream
                  blocks={blocks}
                  centered
                  isWorking={activity.isWorking}
                  onSendMessage={handleSendMessage}
                />
              </div>

              {/* Docked input */}
              <div className="border-t border-border/40 px-4 py-3">
                <div className="mx-auto max-w-4xl">
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
