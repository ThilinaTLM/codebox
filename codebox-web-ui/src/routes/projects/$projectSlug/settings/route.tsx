import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/projects/$projectSlug/settings"
)({
  component: ProjectSettingsLayout,
})

function ProjectSettingsLayout() {
  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      <div className="border-b px-6 py-3">
        <h1 className="font-display text-lg font-semibold">Project Settings</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <Outlet />
      </div>
    </div>
  )
}
