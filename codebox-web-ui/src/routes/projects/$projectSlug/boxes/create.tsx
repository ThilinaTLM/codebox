/**
 * Create box page — project-scoped version.
 * TODO: Migrate full create wizard from routes/boxes/create.tsx
 */
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/projects/$projectSlug/boxes/create"
)({
  component: CreateBoxPage,
})

function CreateBoxPage() {
  const { projectSlug } = Route.useParams()

  return (
    <div className="flex h-[calc(100svh-24px)] items-center justify-center">
      <p className="text-muted-foreground">
        Create box page for project: {projectSlug} (migrating...)
      </p>
    </div>
  )
}
