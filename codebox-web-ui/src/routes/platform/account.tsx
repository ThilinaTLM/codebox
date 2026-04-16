import { createFileRoute } from "@tanstack/react-router"
import { AccountSection } from "@/components/settings/AccountSection"

export const Route = createFileRoute("/platform/account")({
  component: PlatformAccountPage,
})

function PlatformAccountPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <AccountSection />
      </div>
    </div>
  )
}
