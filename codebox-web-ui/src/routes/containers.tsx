import { createFileRoute } from "@tanstack/react-router"
import { ContainerTable } from "@/components/container/ContainerTable"
import { useContainers } from "@/net/query"

export const Route = createFileRoute("/containers")({
  component: ContainersPage,
})

function ContainersPage() {
  const { data: containers } = useContainers()
  const count = containers?.length ?? 0

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <h1 className="font-mono text-sm font-semibold tracking-tight">Containers</h1>
        <span className="font-mono text-xs text-muted-foreground">
          {count} running
        </span>
      </div>
      <ContainerTable />
    </div>
  )
}
