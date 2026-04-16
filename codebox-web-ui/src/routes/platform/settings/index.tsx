import { Navigate, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/platform/settings/")({
  component: () => <Navigate to="/platform/settings/appearance" replace />,
})
