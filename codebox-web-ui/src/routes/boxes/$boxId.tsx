import { useState, useCallback, useRef } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoxStatusBadge } from "@/components/box/BoxStatusBadge"
import { BoxInput } from "@/components/box/BoxInput"
import { FileExplorer } from "@/components/box/FileExplorer"
import { EventStream } from "@/components/task/EventStream"
import { useBox, useStopBox, useDeleteBox } from "@/net/query"
import { useBoxWebSocket } from "@/net/ws"
import { BoxStatus } from "@/net/http/types"
import type { WSEvent } from "@/net/http/types"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HugeiconsIcon } from "@hugeicons/react"
import { MoreHorizontalCircle01Icon } from "@hugeicons/core-free-icons"

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

  const isActive =
    box?.status === BoxStatus.IDLE ||
    box?.status === BoxStatus.RUNNING ||
    box?.status === BoxStatus.STARTING

  const { events, sendMessage, sendExec, sendCancel, isConnected } =
    useBoxWebSocket({
      boxId,
      enabled: isActive,
    })

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
        <p className="text-sm text-muted-foreground">Box not found</p>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/" />}>
          Go home
        </Button>
      </div>
    )
  }

  const handleStop = () => {
    sendCancel()
    stopMutation.mutate(boxId, {
      onSuccess: () => toast.success("Box stopped"),
      onError: () => toast.error("Failed to stop"),
    })
  }

  const handleDelete = () => {
    deleteMutation.mutate(boxId, {
      onSuccess: () => {
        toast.success("Box deleted")
        navigate({ to: "/" })
      },
      onError: () => toast.error("Failed to delete"),
    })
  }

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-medium">{box.name}</h1>
          <BoxStatusBadge status={box.status} />
          {isConnected && isActive && (
            <span className="flex items-center gap-1 text-xs text-success">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-success" />
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant={fileExplorerOpen ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setFileExplorerOpen(!fileExplorerOpen)}
          >
            Files
          </Button>
          {isActive && (
            <Button
              variant="outline"
              size="xs"
              onClick={handleStop}
              disabled={stopMutation.isPending}
            >
              Stop
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" />}>
              <HugeiconsIcon icon={MoreHorizontalCircle01Icon} size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                Delete box
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* File explorer panel (left) */}
        {fileExplorerOpen && (
          <div className="w-64 flex-shrink-0 border-r lg:w-80">
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
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Skeleton className="h-5 w-40" />
      </div>
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
