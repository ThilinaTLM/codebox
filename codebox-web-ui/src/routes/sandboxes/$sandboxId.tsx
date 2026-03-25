import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { SandboxStatusBadge } from "@/components/sandbox/SandboxStatusBadge"
import { SandboxInput } from "@/components/sandbox/SandboxInput"
import { FileExplorer } from "@/components/sandbox/FileExplorer"
import { EventStream } from "@/components/task/EventStream"
import { useSandbox, useStopSandbox, useDeleteSandbox } from "@/net/query"
import { useSandboxWebSocket } from "@/net/ws"
import { SandboxStatus } from "@/net/http/types"
import type { WSEvent } from "@/net/http/types"
import { toast } from "sonner"
import { useRef, useCallback } from "react"

export const Route = createFileRoute("/sandboxes/$sandboxId")({
  component: SandboxDetailPage,
})

function SandboxDetailPage() {
  const { sandboxId } = Route.useParams()
  const { data: sandbox, isLoading } = useSandbox(sandboxId)
  const navigate = useNavigate()
  const stopMutation = useStopSandbox()
  const deleteMutation = useDeleteSandbox()

  const isActive =
    sandbox?.status === SandboxStatus.READY ||
    sandbox?.status === SandboxStatus.STARTING

  const { events, sendMessage, sendExec, sendCancel, isConnected } =
    useSandboxWebSocket({
      sandboxId,
      enabled: true,
    })

  // Track user inputs for display in the event stream
  const localEventsRef = useRef<WSEvent[]>([])

  const handleSendMessage = useCallback(
    (content: string) => {
      // Add user message marker to local events
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
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-sm text-muted-foreground">
          Sandbox not found
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/sandboxes">Back to sandboxes</Link>
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
        navigate({ to: "/sandboxes" })
      },
      onError: () => toast.error("Failed to delete"),
    })
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="truncate text-lg font-semibold">
              {sandbox.name}
            </h1>
            <SandboxStatusBadge status={sandbox.status} />
            {isConnected && isActive && (
              <span className="flex items-center gap-1.5 text-xs text-success">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                </span>
                connected
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {sandbox.model} &middot; {sandbox.id.slice(0, 8)}
            {sandbox.workspace_path && (
              <> &middot; {sandbox.workspace_path}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={stopMutation.isPending}
            >
              Stop
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Main content — resizable panels */}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup direction="horizontal">
          {/* Left: Chat / Event Stream */}
          <ResizablePanel defaultSize={65} minSize={40}>
            <div className="flex h-full flex-col">
              {/* Terminal title bar */}
              <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-1.5">
                <span className="size-2.5 rounded-full bg-destructive/60" />
                <span className="size-2.5 rounded-full bg-warning/60" />
                <span className="size-2.5 rounded-full bg-success/60" />
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {sandbox.name} &mdash; interactive session
                </span>
              </div>

              <div className="min-h-0 flex-1">
                <EventStream events={events} />
              </div>

              {/* Input */}
              <Separator />
              <div className="p-4">
                <SandboxInput
                  onSendMessage={handleSendMessage}
                  onSendExec={handleSendExec}
                  disabled={!isActive || !isConnected}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: File Explorer */}
          <ResizablePanel defaultSize={35} minSize={20}>
            {sandbox.status === SandboxStatus.READY ? (
              <FileExplorer sandboxId={sandboxId} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {sandbox.status === SandboxStatus.STARTING
                    ? "Sandbox is starting..."
                    : "Sandbox is not active"}
                </p>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

function SandboxDetailSkeleton() {
  return (
    <div className="space-y-4 p-8">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-[400px] w-full rounded-lg" />
    </div>
  )
}
