import { useState, useCallback, useRef, useEffect } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoxInput } from "@/components/box/BoxInput"
import { FileExplorer, type ExplorerSize } from "@/components/box/FileExplorer"
import { EventStream } from "@/components/task/EventStream"
import { useBox, useStopBox, useDeleteBox } from "@/net/query"
import { useBoxWebSocket } from "@/net/ws"
import { BoxStatus } from "@/net/http/types"
import type { WSEvent } from "@/net/http/types"
import { toast } from "sonner"
import { useSetBoxPageActions } from "@/components/box/BoxPageContext"
import { FolderOpen, Settings } from "lucide-react"
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
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false)
  const [explorerSize, setExplorerSize] = useState<ExplorerSize>("sm")
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
      isActive,
      isConnected,
    })
    return () => setBoxPageActions(null)
  }, [
    box,
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

  const canShowFiles = box.status === BoxStatus.IDLE || box.status === BoxStatus.RUNNING

  return (
    <div className="relative h-[calc(100svh-3rem)]">
      {/* Floating toggle button - top left */}
      <Button
        variant={fileExplorerOpen ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={() => setFileExplorerOpen((o) => !o)}
        className="absolute left-3 top-3 z-20"
        title={fileExplorerOpen ? "Close file explorer" : "Open file explorer"}
      >
        <FolderOpen size={16} />
      </Button>

      {/* Floating settings button - top right */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" className="absolute right-3 top-3 z-20" />}
        >
          <Settings size={16} />
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

      {/* Floating file explorer panel */}
      {fileExplorerOpen && (
        <div
          className={`absolute left-3 top-12 bottom-3 z-20 overflow-hidden rounded-xl border bg-card shadow-lg ${
            explorerSize === "full"
              ? "right-3"
              : explorerSize === "lg"
                ? "w-[32rem] lg:w-[36rem]"
                : explorerSize === "md"
                  ? "w-96 lg:w-[28rem]"
                  : "w-72 lg:w-80"
          }`}
        >
          {canShowFiles ? (
            <FileExplorer
              boxId={boxId}
              onClose={() => setFileExplorerOpen(false)}
              size={explorerSize}
              onSizeChange={setExplorerSize}
            />
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

      {/* Chat area - full height with bottom inset for floating input */}
      <div className="h-full">
        <EventStream events={events} centered bottomInset />
      </div>

      {/* Floating input - bottom center */}
      <div className="absolute bottom-4 left-1/2 z-20 w-full max-w-3xl -translate-x-1/2 px-4">
        <BoxInput
          onSendMessage={handleSendMessage}
          onSendExec={handleSendExec}
          disabled={!isActive || !isConnected}
        />
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
