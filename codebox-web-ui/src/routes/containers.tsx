import { createFileRoute } from "@tanstack/react-router"
import { ContainerTable } from "@/components/container/container-table"

export const Route = createFileRoute("/containers")({
  component: ContainersPage,
})

function ContainersPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Containers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Running sandbox containers
        </p>
      </div>
      <div className="rounded-lg border">
        <ContainerTable />
      </div>
    </div>
  )
}
