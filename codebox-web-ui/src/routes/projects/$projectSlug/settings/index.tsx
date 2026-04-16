import { Navigate, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/projects/$projectSlug/settings/")({
  component: () => {
    const { projectSlug } = Route.useParams()
    return (
      <Navigate
        to="/projects/$projectSlug/settings/members"
        params={{ projectSlug }}
        replace
      />
    )
  },
})
