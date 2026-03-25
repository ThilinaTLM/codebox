import { useState, useCallback, useRef } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { SandboxStatusBadge } from "@/components/sandbox/SandboxStatusBadge"
import { SandboxInput } from "@/components/sandbox/SandboxInput"
import { FileExplorer } from "@/components/sandbox/FileExplorer"
import { EventStream } from "@/components/task/EventStream"
import { useSandbox, useStopSandbox, useDeleteSandbox } from "@/net/query"
import { useSandboxWebSocket } from "@/net/ws"
import { SandboxStatus } from "@/net/http/types"
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

export const Route = createFileRoute("/sandboxes/$sandboxId")({
  component: SandboxDetailPage,
})

function SandboxDetailPage() {
  const { sandboxId } = Route.useParams()
  const { data: sandbox, isLoading } = useSandbox(sandboxId)
  const navigate = useNavigate()
  const stopMutation = useStopSandbox()
  const deleteMutation = useDeleteSandbox()
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false)

  const isActive =
    sandbox?.status === SandboxStatus.READY ||
    sandbox?.status === SandboxStatus.STARTING

  const { events, sendMessage, sendExec, sendCancel, isConnected } =
    useSandboxWebSocket({
      sandboxId,
      enabled: isActive,
    })

  const localEventsRef = useRef<WSEvent[]>([])

  const handleSendMessage = useCallback(
    (content: string) => {
      localEventsRef.current = [
        ...localEventsRef.current,
        { type: "status_change", status: `you: ${content}` } as WSEvent,
      ]
      sendMessage(content)
    },
    [sendMessage],
  )

  const handleSendExec = useCallback(
    (command: string) => {
      localEventsRef.current = [
        ...localEventsRef.current,
        { type: "status_change", status: `! ${command}` } as WSEvent,
      ]
      sendExec(command)
    },
    [sendExec],
  )

  if (isLoading) return <SandboxDetailSkeleton />

  if (!sandbox) {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Sandbox not found</p>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/" />}>
          Go home
        </Button>
      </div>
    )
  }

  const handleStop = () => {
    sendCancel()
    stopMutation.mutate(sandboxId, {
      onSuccess: () => toast.success("Sandbox stopped"),
      onError: () => toast.error("Failed to stop"),
    })
  }

  const handleDelete = () => {
    deleteMutation.mutate(sandboxId, {
      onSuccess: () => {
        toast.success("Sandbox deleted")
        navigate({ to: "/" })
      },
      onError: () => toast.error("Failed to delete"),
    })
  }

  return (
    <div className="flex h-svh flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <SidebarTrigger />
          <h1 className="truncate text-sm font-medium">{sandbox.name}</h1>
          <SandboxStatusBadge status={sandbox.status} />
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
                Delete sandbox
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        {/* Chat area */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <EventStream events={events} centered />
          </div>

          {/* Input */}
          <div className="border-t bg-background/80 backdrop-blur-sm">
            <div className="mx-auto max-w-3xl px-4 py-4">
              <SandboxInput
                onSendMessage={handleSendMessage}
                onSendExec={handleSendExec}
                disabled={!isActive || !isConnected}
              />
            </div>
          </div>
        </div>

        {/* File explorer panel */}
        {fileExplorerOpen && (
          <div className="w-80 flex-shrink-0 border-l">
            {sandbox.status === SandboxStatus.READY ? (
              <FileExplorer sandboxId={sandboxId} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {sandbox.status === SandboxStatus.STARTING
                    ? "Starting..."
                    : "Not active"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SandboxDetailSkeleton() {
  return (
    <div className="flex h-svh flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Skeleton className="h-6 w-6" />
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
