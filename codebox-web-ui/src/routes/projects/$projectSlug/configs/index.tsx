import { Navigate, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/projects/$projectSlug/configs/")({
  component: () => {
    const { projectSlug } = Route.useParams()
    return (
      <Navigate
        to="/projects/$projectSlug/configs/members"
        params={{ projectSlug }}
        replace
      />
    )
  },
})
