import { Navigate, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/platform/")({
  component: () => <Navigate to="/platform/projects" replace />,
})
