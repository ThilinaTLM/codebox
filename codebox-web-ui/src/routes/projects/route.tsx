import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router"
import { useState } from "react"
import type { BoxPageActions } from "@/components/box/BoxPageContext"
import { ProjectSidebar } from "@/components/layout/ProjectSidebar"
import { StatusBar } from "@/components/layout/StatusBar"
import { CommandPalette } from "@/components/CommandPalette"
import {
  BoxPageActionsContext,
  BoxPageSetterContext,
} from "@/components/box/BoxPageContext"

export const Route = createFileRoute("/projects")({
  component: ProjectsLayout,
})

function ProjectsLayout() {
  const [boxPageActions, setBoxPageActions] = useState<BoxPageActions | null>(
    null
  )
  const location = useLocation()

  // Stable key for nested sub-routes so they don't remount unnecessarily.
  const boxMatch = location.pathname.match(
    /^\/projects\/[^/]+\/boxes\/([^/]+)/
  )
  const slugMatch = location.pathname.match(/^\/projects\/([^/]+)/)
  const slugKey = slugMatch ? slugMatch[1] : "none"
  const settingsMatch = location.pathname.startsWith(
    `/projects/${slugKey}/settings`
  )
  const pageKey = settingsMatch
    ? `/projects/${slugKey}/settings`
    : boxMatch
      ? `/projects/${slugKey}/boxes/${boxMatch[1]}`
      : location.pathname

  return (
    <BoxPageSetterContext value={setBoxPageActions}>
      <BoxPageActionsContext value={boxPageActions}>
        <div className="flex h-svh overflow-hidden">
          <ProjectSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <main
              key={pageKey}
              className="flex-1 overflow-hidden animate-page-enter"
            >
              <Outlet />
            </main>
            <StatusBar />
          </div>
        </div>
        <CommandPalette />
      </BoxPageActionsContext>
    </BoxPageSetterContext>
  )
}
