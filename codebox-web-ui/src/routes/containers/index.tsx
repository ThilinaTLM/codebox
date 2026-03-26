import { createFileRoute } from "@tanstack/react-router"
import { useContainers } from "@/net/query"
import { ContainerTable } from "@/components/container/ContainerTable"

export const Route = createFileRoute("/containers/")({
  component: ContainersPage,
})

function ContainersPage() {
  const { data: containers } = useContainers()
  const total = containers?.length ?? 0
  const running = containers?.filter((c) => c.status === "running").length ?? 0

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col overflow-y-auto">
      <div className="px-6 py-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Containers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} container{total !== 1 ? "s" : ""}
          {running > 0 ? ` · ${running} running` : ""}
        </p>
      </div>

      <div className="flex-1 px-6 pb-12">
        <ContainerTable />
      </div>
    </div>
  )
}
