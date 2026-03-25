import { createFileRoute } from "@tanstack/react-router"
import { ContainerTable } from "@/components/container/ContainerTable"
import { useContainers } from "@/net/query"
import { SidebarTrigger } from "@/components/ui/sidebar"

export const Route = createFileRoute("/containers")({
  component: ContainersPage,
})

function ContainersPage() {
  const { data: containers } = useContainers()
  const count = containers?.length ?? 0

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <SidebarTrigger />
        <h1 className="text-xl font-semibold tracking-tight">Containers</h1>
        <span className="text-sm text-muted-foreground">
          {count} running
        </span>
      </div>
      <ContainerTable />
    </div>
  )
}
