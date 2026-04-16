import { Navigate, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/users")({
  component: () => <Navigate to="/platform/users" replace />,
})
