/**
 * Box detail layout — project-scoped.
 * TODO: Migrate full layout from routes/boxes/$boxId/route.tsx
 */
import { Outlet, createFileRoute } from "@tanstack/react-router"
import { Skeleton } from "@/components/ui/skeleton"
import { useBox } from "@/net/query"

export const Route = createFileRoute(
  "/projects/$projectSlug/boxes/$boxId"
)({
  component: BoxDetailLayout,
})

function BoxDetailLayout() {
  const { projectSlug, boxId } = Route.useParams()
  const { data: box, isLoading } = useBox(projectSlug, boxId)

  if (isLoading) {
    return (
      <div className="flex h-[calc(100svh-24px)] flex-col p-8">
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  if (!box) {
    return (
      <div className="flex h-[calc(100svh-24px)] items-center justify-center">
        <p className="text-muted-foreground">Agent not found</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100svh-24px)] flex-col">
      <div className="border-b px-6 py-3">
        <h2 className="font-display text-lg font-semibold">{box.name}</h2>
        <p className="text-sm text-muted-foreground">
          {box.provider} / {box.model}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
