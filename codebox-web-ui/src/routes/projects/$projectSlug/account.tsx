import { createFileRoute } from "@tanstack/react-router"
import { AccountSection } from "@/components/settings/AccountSection"

export const Route = createFileRoute("/projects/$projectSlug/account")({
  component: ProjectAccountPage,
})

function ProjectAccountPage() {
  return (
    <div className="h-[calc(100svh-24px)] overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <AccountSection />
      </div>
    </div>
  )
}
