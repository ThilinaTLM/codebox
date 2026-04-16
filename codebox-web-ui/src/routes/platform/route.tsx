import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import type { BoxPageActions } from "@/components/box/BoxPageContext"
import { useAuthStore } from "@/lib/auth"
import { PlatformSidebar } from "@/components/layout/PlatformSidebar"
import {
  BoxPageActionsContext,
  BoxPageSetterContext,
} from "@/components/box/BoxPageContext"

export const Route = createFileRoute("/platform")({
  component: PlatformLayout,
})

function PlatformLayout() {
  const user = useAuthStore((s) => s.user)
  const isPlatformAdmin = user?.user_type === "admin"
  const [boxPageActions, setBoxPageActions] = useState<BoxPageActions | null>(
    null
  )

  if (!isPlatformAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <BoxPageSetterContext value={setBoxPageActions}>
      <BoxPageActionsContext value={boxPageActions}>
        <div className="flex h-svh overflow-hidden">
          <PlatformSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <main className="flex-1 overflow-hidden animate-page-enter">
              <Outlet />
            </main>
          </div>
        </div>
      </BoxPageActionsContext>
    </BoxPageSetterContext>
  )
}
