/**
 * Agent detail layout — project-scoped.
 *
 * Provides the shared header, tabs, alerts, and `BoxDetailContext` for all
 * nested agent pages (Overview, Chat, Files, Terminal, Logs, Resources).
 */
import { useEffect } from "react"
import { Link, Outlet, createFileRoute } from "@tanstack/react-router"
import {
  FileText,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  Server,
  Terminal,
} from "lucide-react"

import { BoxDetailAlerts } from "@/components/box/BoxDetailAlerts"
import { BoxDetailContext } from "@/components/box/BoxDetailContext"
import { BoxDetailHeader } from "@/components/box/BoxDetailHeader"
import { useSetBoxPageActions } from "@/components/box/BoxPageContext"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAgentActivity } from "@/hooks/useAgentActivity"
import { useBoxActions } from "@/hooks/useBoxActions"
import { useChatState } from "@/hooks/useChatState"
import { useElapsedTime } from "@/hooks/useElapsedTime"
import { ContainerStatus } from "@/net/http/types"
import { useBox } from "@/net/query"

// ── Route ───────────────────────────────────────────────────

export const Route = createFileRoute(
  "/projects/$projectSlug/boxes/$boxId"
)({
  component: BoxDetailLayout,
})

// ── Tab config ──────────────────────────────────────────────

const TABS: Array<{
  to:
    | "/projects/$projectSlug/boxes/$boxId"
    | "/projects/$projectSlug/boxes/$boxId/chat"
    | "/projects/$projectSlug/boxes/$boxId/files"
    | "/projects/$projectSlug/boxes/$boxId/terminal"
    | "/projects/$projectSlug/boxes/$boxId/logs"
    | "/projects/$projectSlug/boxes/$boxId/resources"
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
}> = [
  {
    to: "/projects/$projectSlug/boxes/$boxId",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    to: "/projects/$projectSlug/boxes/$boxId/chat",
    label: "Chat",
    icon: MessageSquare,
  },
  {
    to: "/projects/$projectSlug/boxes/$boxId/files",
    label: "Files",
    icon: FileText,
  },
  {
    to: "/projects/$projectSlug/boxes/$boxId/terminal",
    label: "Terminal",
    icon: Terminal,
  },
  {
    to: "/projects/$projectSlug/boxes/$boxId/logs",
    label: "Logs",
    icon: ScrollText,
  },
  {
    to: "/projects/$projectSlug/boxes/$boxId/resources",
    label: "Resources",
    icon: Server,
  },
]

// ── Layout ──────────────────────────────────────────────────

function BoxDetailLayout() {
  const { projectSlug, boxId } = Route.useParams()
  const { data: box, isLoading } = useBox(projectSlug, boxId)
  const setBoxPageActions = useSetBoxPageActions()

  const isActive =
    box?.container_status === ContainerStatus.RUNNING ||
    box?.container_status === ContainerStatus.STARTING
  const isStopped = box?.container_status === ContainerStatus.STOPPED

  const { liveEvents, isConnected } = useChatState({
    slug: projectSlug,
    boxId,
  })
  const actions = useBoxActions(projectSlug, boxId)

  const activity = useAgentActivity(
    liveEvents,
    box?.container_status,
    box?.activity ?? undefined
  )
  const elapsed = useElapsedTime(box?.started_at ?? null, !!isActive)

  // Sync page-level actions to context (used by StatusBar, AppSidebar).
  useEffect(() => {
    if (!box) return
    setBoxPageActions({
      isActive,
      activity,
      grpcConnected: box.grpc_connected,
      chatConnected: isConnected,
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
    activity,
    isStopped,
    actions,
    isConnected,
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
          render={
            <Link to="/projects/$projectSlug" params={{ projectSlug }} />
          }
        >
          Go to agents
        </Button>
      </div>
    )
  }

  const tabsElement = TABS.map((tab) => (
    <Link
      key={tab.to}
      to={tab.to}
      params={{ projectSlug, boxId }}
      activeOptions={{ exact: tab.exact ?? false }}
      className="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{
        className:
          "flex items-center gap-1.5 border-b-2 border-foreground px-3 py-2 text-sm font-medium text-foreground transition-colors",
      }}
    >
      <tab.icon size={14} />
      {tab.label}
    </Link>
  ))

  return (
    <BoxDetailContext
      value={{
        box,
        boxId,
        projectSlug,
        isActive,
        isStopped,
        activity,
        elapsed,
        actions,
        isConnected,
        liveEvents,
      }}
    >
      <div className="flex h-[calc(100svh-24px)] flex-col">
        <BoxDetailHeader
          box={box}
          projectSlug={projectSlug}
          activity={activity}
          elapsed={elapsed}
          tabs={tabsElement}
        />

        <BoxDetailAlerts
          containerStatus={box.container_status}
          grpcConnected={box.grpc_connected}
          errorDetail={box.error_detail}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </BoxDetailContext>
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
