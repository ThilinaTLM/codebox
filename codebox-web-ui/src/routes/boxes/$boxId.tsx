import { useState, useCallback, useRef, useEffect } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoxInput } from "@/components/box/BoxInput"
import { FileExplorer } from "@/components/box/FileExplorer"
import { EventStream } from "@/components/task/EventStream"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { useBox, useStopBox, useDeleteBox } from "@/net/query"
import { useBoxWebSocket } from "@/net/ws"
import { BoxStatus } from "@/net/http/types"
import type { WSEvent } from "@/net/http/types"
import { useAgentActivity } from "@/hooks/useAgentActivity"
import { toast } from "sonner"
import { useSetBoxPageActions } from "@/components/box/BoxPageContext"
import { PanelLeftOpen, PanelLeftClose, Settings } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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

  useEffect(() => {
    if (!box) return
    setBoxPageActions({
      isActive,
      isConnected,
      activity,
    })
    return () => setBoxPageActions(null)
  }, [
    box,
    isActive,
    isConnected,
    activity,
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

  const canShowFiles = box.status === BoxStatus.IDLE || box.status === BoxStatus.RUNNING

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/50 px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowFiles((o) => !o)}
          title={showFiles ? "Hide files" : "Show files"}
          className="text-muted-foreground"
        >
          {showFiles ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
        </Button>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}
            >
              <Settings size={15} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isActive && (
                <DropdownMenuItem
                  onClick={handleStop}
                  disabled={stopMutation.isPending}
                >
                  Stop agent
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                Delete agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main content area */}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          {/* File explorer panel */}
          {showFiles && (
            <>
              <ResizablePanel
                defaultSize={25}
                minSize={15}
                maxSize={50}
                className="bg-card/50"
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
              <ResizableHandle />
            </>
          )}

          {/* Chat panel */}
          <ResizablePanel defaultSize={showFiles ? 75 : 100}>
            <div className="relative flex h-full flex-col">
              {/* Event stream */}
              <div className="min-h-0 flex-1">
                <EventStream events={events} centered bottomInset />
              </div>

              {/* Input at bottom */}
              <div className="shrink-0 border-t border-border/30 bg-background/80 px-4 py-3 backdrop-blur-sm">
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
      <div className="h-9 shrink-0 border-b border-border/50" />
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
