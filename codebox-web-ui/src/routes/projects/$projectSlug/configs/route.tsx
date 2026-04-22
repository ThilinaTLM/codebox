import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/projects/$projectSlug/configs")({
  component: ProjectConfigsLayout,
})

function ProjectConfigsLayout() {
  return (
    <div className="flex h-[calc(100svh-24px)]">
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
