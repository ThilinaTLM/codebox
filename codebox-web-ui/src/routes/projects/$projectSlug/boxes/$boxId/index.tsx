import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/projects/$projectSlug/boxes/$boxId/"
)({
  component: BoxOverview,
})

function BoxOverview() {
  return <div className="p-6">Box overview (migrating...)</div>
}
