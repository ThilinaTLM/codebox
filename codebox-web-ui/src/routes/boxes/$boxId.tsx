import { useCallback, useEffect, useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { ActivityBar } from "@/components/box/ActivityBar"
import { BoxDetailAlerts } from "@/components/box/BoxDetailAlerts"
import { BoxDetailToolbar } from "@/components/box/BoxDetailToolbar"
import { BoxInput } from "@/components/box/BoxInput"
import { useSetBoxPageActions } from "@/components/box/BoxPageContext"
import { FileExplorer } from "@/components/box/FileExplorer"
import { FilePreview } from "@/components/box/FilePreview"
import { ChatStream } from "@/components/chat/ChatStream"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { useAgentActivity } from "@/hooks/useAgentActivity"
import { useBoxActions } from "@/hooks/useBoxActions"
import { useChatState } from "@/hooks/useChatState"
import { useElapsedTime } from "@/hooks/useElapsedTime"
import { ContainerStatus } from "@/net/http/types"
import { useBox } from "@/net/query"

export const Route = createFileRoute("/boxes/$boxId")({
  component: BoxDetailPage,
})

function BoxDetailPage() {
  const { boxId } = Route.useParams()
  const { data: box, isLoading } = useBox(boxId)
  const [showFiles, setShowFiles] = useState(true)
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const filePanelRef = useRef<PanelImperativeHandle>(null)
  const setBoxPageActions = useSetBoxPageActions()

  const isActive =
    box?.container_status === ContainerStatus.RUNNING ||
    box?.container_status === ContainerStatus.STARTING
  const isStopped = box?.container_status === ContainerStatus.STOPPED

  const { blocks, liveEvents, isConnected } = useChatState({ boxId })
  const actions = useBoxActions(boxId)

  const activity = useAgentActivity(
    liveEvents,
    box?.container_status,
    box?.activity ?? undefined
  )
  const elapsed = useElapsedTime(box?.started_at ?? null, !!isActive)

  const toggleFiles = useCallback(() => {
    const panel = filePanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }, [])

  // Sync page-level actions to context (used by StatusBar, AppSidebar)
  useEffect(() => {
    if (!box) return
    setBoxPageActions({
      isActive,
      isConnected,
      activity,
      showFiles,
      onToggleFiles: toggleFiles,
      onStop: actions.stop,
      onDelete: actions.delete,
      onRestart: isStopped ? actions.restart : undefined,
      isStopPending: actions.isStopPending,
      isDeletePending: actions.isDeletePending,
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
    actions,
    setBoxPageActions,
  ])

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
      <div className="min-h-0 flex-1 p-2">
        <ResizablePanelGroup orientation="horizontal" id="box-detail">
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
              onFileSelect={(path) => setPreviewFile(path)}
              disabled={!isActive}
            />
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-transparent" />

          <ResizablePanel id="chat-panel" defaultSize={80} minSize={30}>
            <div className="flex h-full flex-col">
              <BoxDetailToolbar
                box={box}
                activity={activity}
                elapsed={elapsed}
                isActive={isActive}
                isStopped={isStopped}
                onStop={actions.stop}
                onRestart={actions.restart}
                onDelete={actions.delete}
                isStopPending={actions.isStopPending}
                isRestartPending={actions.isRestartPending}
                isDeletePending={actions.isDeletePending}
              />

              <ActivityBar activity={activity} />

              <BoxDetailAlerts
                containerStatus={box.container_status}
                grpcConnected={box.grpc_connected}
                errorDetail={box.error_detail}
              />

              <div className="min-h-0 flex-1 overflow-hidden">
                <ChatStream
                  blocks={blocks}
                  centered
                  isWorking={activity.isWorking}
                  onSendMessage={actions.sendMessage}
                />
              </div>

              <div className="border-t border-border/40 px-4 py-3">
                <div className="mx-auto max-w-4xl">
                  <BoxInput
                    onSendMessage={actions.sendMessage}
                    onSendExec={actions.sendExec}
                    onCancel={actions.cancel}
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
          onClose={() => setPreviewFile(null)}
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
