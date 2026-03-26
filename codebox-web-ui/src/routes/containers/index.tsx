import { createFileRoute } from "@tanstack/react-router"
import { ContainerTable } from "@/components/container/ContainerTable"
import { useContainers } from "@/net/query"

export const Route = createFileRoute("/containers/")({
  component: ContainersPage,
})

function ContainersPage() {
  const { data: containers } = useContainers()
  const total = containers?.length ?? 0
  const running = containers?.filter((c) => c.status === "running").length ?? 0

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-y-auto">
      {/* Page header */}
      <div className="bg-hero-gradient px-6 pt-10 pb-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-4xl font-bold tracking-tight">
            Containers
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            {total} container{total !== 1 ? "s" : ""}
            {running > 0 ? ` · ${running} running` : ""}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-12">
        <div className="mx-auto max-w-6xl">
          <ContainerTable />
        </div>
      </div>
    </div>
  )
}
