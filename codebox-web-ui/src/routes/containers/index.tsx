import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/containers/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { tab: "containers" } })
  },
  component: () => null,
})
